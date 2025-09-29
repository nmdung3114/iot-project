const ControlHistory = require('../models/ControlHistory');

const historyController = {
  // Get control history with filtering
  async getControlHistory(req, res) {
    try {
      const { 
        page = 1, 
        limit = 25, 
        deviceId, 
        action, 
        sortBy = 'timestamp',
        sortOrder = 'desc',
        search   
      } = req.query;

      const filter = { source: { $ne: 'mqtt' } }; 

      if (deviceId && deviceId !== 'all') filter.deviceId = deviceId;
      if (action && action !== 'all') filter.action = action.toUpperCase();

      if (search && search.trim() !== '') {
        const searchLower = search.toLowerCase().trim();

        // Sử dụng hàm createTimeFilter từ sensorController
        const timeFilter = createTimeFilter(searchLower);
        if (timeFilter) {
          filter.timestamp = timeFilter.timestamp;
        } else {
          filter.$or = [
            { device_name: { $regex: searchLower, $options: 'i' } },
            { action: { $regex: searchLower, $options: 'i' } },
            { message: { $regex: searchLower, $options: 'i' } }
          ];
        }
      }

      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const data = await ControlHistory.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await ControlHistory.countDocuments(filter);

      res.json({
        success: true,
        data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Error fetching control history:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching control history' 
      });
    }
  },

  // Export history to CSV
  async exportControlHistory(req, res) {
    try {
      const filter = { source: { $ne: 'mqtt' } }; 
      const data = await ControlHistory.find(filter).sort({ timestamp: -1 });

      let csvContent = 'Thời gian,Thiết bị,Lệnh,Trạng thái\n';
      data.forEach(item => {
        const date = new Date(item.timestamp);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const formattedTime = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
        
        csvContent += `"${formattedTime}",${item.device_name},${item.action},${item.success ? 'Thành công' : 'Thất bại'}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=control_history.csv');
      res.send(csvContent);

    } catch (error) {
      console.error('Error exporting history:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error exporting history' 
      });
    }
  },

  // Clear history data
  async clearControlHistory(req, res) {
    try {
      const { days } = req.query;
      let filter = {};

      if (days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        filter = { timestamp: { $lt: cutoffDate } };
      }

      const result = await ControlHistory.deleteMany(filter);

      res.json({
        success: true,
        message: `Deleted ${result.deletedCount} control history records`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('Error clearing control history:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error clearing control history' 
      });
    }
  },

  // Get history statistics
  async getHistoryStats(req, res) {
    try {
      const totalRecords = await ControlHistory.countDocuments({ source: { $ne: 'mqtt' } });
      const successCount = await ControlHistory.countDocuments({ success: true, source: { $ne: 'mqtt' } });
      const failureCount = await ControlHistory.countDocuments({ success: false, source: { $ne: 'mqtt' } });

      res.json({
        success: true,
        data: {
          totalRecords,
          successCount,
          failureCount
        }
      });
    } catch (error) {
      console.error('Error fetching history stats:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching history statistics' 
      });
    }
  }
};

// Hàm helper tạo filter thời gian linh hoạt (GIỐNG sensorController)
function createTimeFilter(searchTerm) {
    try {
        // Chuẩn hóa searchTerm - loại bỏ khoảng trắng thừa
        const normalizedTerm = searchTerm.trim();
        
        // Xử lý các trường hợp đặc biệt với dấu / ở cuối hoặc số năm không đủ
        if (normalizedTerm.endsWith('/')) {
            // Trường hợp: "2025/", "2025/9/"
            const parts = normalizedTerm.split('/').filter(part => part !== '');
            
            if (parts.length === 1 && /^\d+$/.test(parts[0])) {
                // Trường hợp: "2025/" - tìm theo năm bắt đầu bằng 2025
                const yearPrefix = parts[0];
                return {
                    timestamp: {
                        $regex: `^${yearPrefix}`, // Tìm timestamp bắt đầu bằng năm này
                        $options: 'i'
                    }
                };
            } else if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
                // Trường hợp: "2025/9/" - tìm theo năm và tháng
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                
                // Đảm bảo năm và tháng hợp lệ
                if (year >= 1000 && year <= 9999 && month >= 1 && month <= 12) {
                    return {
                        timestamp: {
                            $gte: new Date(year, month - 1, 1),
                            $lte: new Date(year, month, 0, 23, 59, 59, 999)
                        }
                    };
                }
            }
        } else if (/^\d{1,3}$/.test(normalizedTerm)) {
            // Trường hợp: "202" - tìm theo phần đầu của năm
            const yearPrefix = normalizedTerm;
            return {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$timestamp" },
                        regex: `^${yearPrefix}`
                    }
                }
            };
        }

        // Pattern nhận diện các định dạng thời gian đầy đủ
        const patterns = [
            // Năm (2024)
            /^\d{4}$/,
            // Năm/Tháng (2024/12)
            /^\d{4}\/\d{1,2}$/,
            // Năm/Tháng/Ngày (2024/12/25)
            /^\d{4}\/\d{1,2}\/\d{1,2}$/,
            // Năm/Tháng/Ngày Giờ (2024/12/25 14)
            /^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}$/,
            // Năm/Tháng/Ngày Giờ: (2024/12/25 14:)
            /^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:$/,
            // Năm/Tháng/Ngày Giờ:Phút (2024/12/25 14:30)
            /^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}$/,
            // Năm/Tháng/Ngày Giờ:Phút: (2024/12/25 14:30:)
            /^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}:$/,
            // Năm/Tháng/Ngày Giờ:Phút:Giây (2024/12/25 14:30:45)
            /^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}$/,
            // Giờ:Phút:Giây (14:30:45) - tự động thêm ngày hiện tại
            /^\d{1,2}:\d{1,2}:\d{1,2}$/,
            // Giờ:Phút (14:30) - tự động thêm ngày hiện tại
            /^\d{1,2}:\d{1,2}$/,
            // Giờ: (14:) - tự động thêm ngày hiện tại
            /^\d{1,2}:$/
        ];

        let dateRange = {};

        // Kiểm tra từng pattern đầy đủ
        if (patterns.some(pattern => pattern.test(normalizedTerm))) {
            if (/^\d{4}$/.test(normalizedTerm)) {
                // Chỉ năm: 2024
                const year = parseInt(normalizedTerm);
                dateRange = {
                    $gte: new Date(year, 0, 1),
                    $lte: new Date(year, 11, 31, 23, 59, 59, 999)
                };
            } else if (/^\d{4}\/\d{1,2}$/.test(normalizedTerm)) {
                // Năm/Tháng: 2024/12
                const [year, month] = normalizedTerm.split('/').map(Number);
                dateRange = {
                    $gte: new Date(year, month - 1, 1),
                    $lte: new Date(year, month, 0, 23, 59, 59, 999)
                };
            } else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalizedTerm)) {
                // Năm/Tháng/Ngày: 2024/12/25
                const [year, month, day] = normalizedTerm.split('/').map(Number);
                dateRange = {
                    $gte: new Date(year, month - 1, day),
                    $lte: new Date(year, month - 1, day, 23, 59, 59, 999)
                };
            } else if (/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}$/.test(normalizedTerm)) {
                // Năm/Tháng/Ngày Giờ: 2024/12/25 14
                const [datePart, hour] = normalizedTerm.split(' ');
                const [year, month, day] = datePart.split('/').map(Number);
                dateRange = {
                    $gte: new Date(year, month - 1, day, parseInt(hour)),
                    $lte: new Date(year, month - 1, day, parseInt(hour), 59, 59, 999)
                };
            } else if (/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:$/.test(normalizedTerm)) {
                // Năm/Tháng/Ngày Giờ:: 2024/12/25 14:
                const [datePart, timePart] = normalizedTerm.split(' ');
                const [year, month, day] = datePart.split('/').map(Number);
                const hour = parseInt(timePart.replace(':', ''));
                dateRange = {
                    $gte: new Date(year, month - 1, day, hour),
                    $lte: new Date(year, month - 1, day, hour, 59, 59, 999)
                };
            } else if (/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}$/.test(normalizedTerm)) {
                // Năm/Tháng/Ngày Giờ:Phút: 2024/12/25 14:30
                const [datePart, timePart] = normalizedTerm.split(' ');
                const [year, month, day] = datePart.split('/').map(Number);
                const [hour, minute] = timePart.split(':').map(Number);
                dateRange = {
                    $gte: new Date(year, month - 1, day, hour, minute),
                    $lte: new Date(year, month - 1, day, hour, minute, 59, 999)
                };
            } else if (/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}:$/.test(normalizedTerm)) {
                // Năm/Tháng/Ngày Giờ:Phút:: 2024/12/25 14:30:
                const [datePart, timePart] = normalizedTerm.split(' ');
                const [year, month, day] = datePart.split('/').map(Number);
                const [hour, minute] = timePart.split(':').map(Number);
                dateRange = {
                    $gte: new Date(year, month - 1, day, hour, minute),
                    $lte: new Date(year, month - 1, day, hour, minute, 59, 999)
                };
            } else if (/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}$/.test(normalizedTerm)) {
                // Năm/Tháng/Ngày Giờ:Phút:Giây: 2024/12/25 14:30:45
                const [datePart, timePart] = normalizedTerm.split(' ');
                const [year, month, day] = datePart.split('/').map(Number);
                const [hour, minute, second] = timePart.split(':').map(Number);
                dateRange = {
                    $gte: new Date(year, month - 1, day, hour, minute, second),
                    $lte: new Date(year, month - 1, day, hour, minute, second, 999)
                };
            } else if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(normalizedTerm)) {
                // Giờ:Phút:Giây: 14:30:45 (dùng ngày hiện tại)
                const [hour, minute, second] = normalizedTerm.split(':').map(Number);
                const today = new Date();
                dateRange = {
                    $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, second),
                    $lte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, second, 999)
                };
            } else if (/^\d{1,2}:\d{1,2}$/.test(normalizedTerm)) {
                // Giờ:Phút: 14:30 (dùng ngày hiện tại)
                const [hour, minute] = normalizedTerm.split(':').map(Number);
                const today = new Date();
                dateRange = {
                    $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute),
                    $lte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, 59, 999)
                };
            } else if (/^\d{1,2}:$/.test(normalizedTerm)) {
                // Giờ:: 14: (dùng ngày hiện tại)
                const hour = parseInt(normalizedTerm.replace(':', ''));
                const today = new Date();
                dateRange = {
                    $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour),
                    $lte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, 59, 59, 999)
                };
            }

            if (Object.keys(dateRange).length > 0) {
                return { timestamp: dateRange };
            }
        }

        return null;
    } catch (error) {
        console.error('Error creating time filter:', error);
        return null;
    }
}

module.exports = historyController;