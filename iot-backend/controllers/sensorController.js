const SensorData = require('../models/SensorData');
const Device = require('../models/Device');

const sensorController = {
    // Lấy dữ liệu sensor với filter, pagination
    async getSensorData(req, res) {
        try {
            let { 
                page = 1, 
                limit = 10,
                deviceId, 
                sensorType, 
                startDate, 
                endDate, 
                search,
                sortBy = 'timestamp', 
                sortOrder = 'desc' 
            } = req.query;

            page = parseInt(page);
            limit = parseInt(limit);
            const skip = (page - 1) * limit;

            const filter = {};
            if (deviceId) filter.deviceId = deviceId;

            // Xử lý filter theo khoảng thời gian
            if (startDate || endDate) {
                filter.timestamp = {};
                if (startDate) filter.timestamp.$gte = new Date(startDate);
                if (endDate) filter.timestamp.$lte = new Date(endDate + 'T23:59:59');
            }

            // Xử lý tìm kiếm đa điều kiện
            if (search && search.trim() !== '') {
                const searchTerm = search.trim();
                const searchConditions = [];

                // 1. Tìm kiếm theo thời gian với các định dạng linh hoạt
                const timeFilter = createTimeFilter(searchTerm);
                if (timeFilter) {
                    searchConditions.push(timeFilter);
                }

                // 2. Tìm kiếm theo giá trị sensor (nhiệt độ, độ ẩm, ánh sáng)
                const sensorValueFilter = createSensorValueFilter(searchTerm);
                if (sensorValueFilter) {
                    searchConditions.push(sensorValueFilter);
                }

                // 3. Tìm kiếm theo status
                if (['normal', 'warning', 'error', 'offline'].includes(searchTerm.toLowerCase())) {
                    searchConditions.push({ 
                        status: { $regex: searchTerm, $options: 'i' } 
                    });
                }

                // Nếu có điều kiện tìm kiếm, sử dụng $or
                if (searchConditions.length > 0) {
                    filter.$or = searchConditions;
                }
            }

            const aggregationPipeline = [];
            if (Object.keys(filter).length > 0) {
                aggregationPipeline.push({ $match: filter });
            }

            // Group by timestamp để tránh trùng lặp
            aggregationPipeline.push({
                $addFields: {
                    roundedTimestamp: {
                        $dateFromParts: {
                            year: { $year: "$timestamp" },
                            month: { $month: "$timestamp" },
                            day: { $dayOfMonth: "$timestamp" },
                            hour: { $hour: "$timestamp" },
                            minute: { $minute: "$timestamp" },
                            second: { $second: "$timestamp" }
                        }
                    }
                }
            });

            aggregationPipeline.push({
                $group: {
                    _id: "$roundedTimestamp",
                    timestamp: { $first: "$roundedTimestamp" },
                    temperature: { 
                        $max: { 
                            $cond: [{ $ifNull: ["$data.temperature", false] }, "$data.temperature", null] 
                        } 
                    },
                    humidity: { 
                        $max: { 
                            $cond: [{ $ifNull: ["$data.humidity", false] }, "$data.humidity", null] 
                        } 
                    },
                    light: { 
                        $max: { 
                            $cond: [{ $ifNull: ["$data.light", false] }, "$data.light", null] 
                        } 
                    },
                    status: { $max: "$status" }
                }
            });

            // Filter theo loại sensor nếu specified
            if (sensorType && sensorType !== 'all') {
                aggregationPipeline.push({
                    $match: { [sensorType]: { $ne: null } }
                });
            }

            // Sắp xếp
            aggregationPipeline.push({
                $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
            });

            // Pipeline cho đếm tổng số record
            const countPipeline = [...aggregationPipeline, { $count: "total" }];
            
            // Pipeline cho lấy dữ liệu (có phân trang)
            const dataPipeline = [
                ...aggregationPipeline, 
                { $skip: skip }, 
                { $limit: limit }
            ];

            const [countResult, data] = await Promise.all([
                SensorData.aggregate(countPipeline),
                SensorData.aggregate(dataPipeline)
            ]);

            const total = countResult.length > 0 ? countResult[0].total : 0;
            const totalPages = Math.ceil(total / limit);

            res.json({
                success: true,
                data,
                pagination: {
                    page: page,
                    limit: limit,
                    total: total,
                    pages: totalPages
                }
            });
        } catch (error) {
            console.error('Error fetching sensor data:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Error fetching sensor data' 
            });
        }
    },

    // Lấy dữ liệu mới nhất
    async getLatestData(req, res) {
        try {
            const latestData = await SensorData.aggregate([
                { $sort: { timestamp: -1 } },
                { $group: { _id: "$deviceId", latestDoc: { $first: "$$ROOT" } } },
                { $replaceRoot: { newRoot: "$latestDoc" } }
            ]);

            res.json({
                success: true,
                data: latestData
            });
        } catch (error) {
            console.error('Error fetching latest data:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Error fetching latest data' 
            });
        }
    },

    // Xóa dữ liệu sensor
    async clearSensorData(req, res) {
        try {
            const { days } = req.query;
            let filter = {};

            if (days) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
                filter = { timestamp: { $lt: cutoffDate } };
            }

            const result = await SensorData.deleteMany(filter);

            res.json({
                success: true,
                message: `Deleted ${result.deletedCount} sensor data records`,
                deletedCount: result.deletedCount
            });
        } catch (error) {
            console.error('Error clearing sensor data:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Error clearing sensor data' 
            });
        }
    },

    // Lấy thống kê sensor
    async getSensorStats(req, res) {
        try {
            const count = await SensorData.countDocuments();
            res.json({
                success: true,
                stats: { totalRecords: count }
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Error fetching sensor stats' 
            });
        }
    },

    // Lấy dữ liệu theo device
    async getDeviceData(req, res) {
        try {
            const { deviceId } = req.params;
            
            const data = await SensorData.aggregate([
                { $match: { deviceId: deviceId } },
                {
                    $group: {
                        _id: {
                            timestamp: "$timestamp",
                            deviceId: "$deviceId"
                        },
                        timestamp: { $first: "$timestamp" },
                        deviceId: { $first: "$deviceId" },
                        temperature: { 
                            $max: { 
                                $cond: [{ $ifNull: ["$data.temperature", false] }, "$data.temperature", null] 
                            } 
                        },
                        humidity: { 
                            $max: { 
                                $cond: [{ $ifNull: ["$data.humidity", false] }, "$data.humidity", null] 
                            } 
                        },
                        light: { 
                            $max: { 
                                $cond: [{ $ifNull: ["$data.light", false] }, "$data.light", null] 
                            } 
                        },
                        status: { $max: "$status" }
                    }
                },
                { $sort: { timestamp: -1 } }
            ]);

            const formattedData = data.map(item => ({
                _id: item._id,
                timestamp: item.timestamp,
                temperature: item.temperature,
                humidity: item.humidity,
                light: item.light,
                status: item.status || 'normal',
                deviceId: item.deviceId
            }));

            res.json({
                success: true,
                deviceId,
                data: formattedData
            });
        } catch (error) {
            console.error('Error fetching device data:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Error fetching device data' 
            });
        }
    }
};

// Hàm helper tạo filter thời gian linh hoạt (ĐÃ SỬA ĐỂ HỖ TRỢ CÁC ĐỊNH DẠNG KHÔNG ĐẦY ĐỦ)
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

// Hàm helper tìm kiếm theo giá trị sensor
function createSensorValueFilter(searchTerm) {
    if (/^-?\d*\.?\d+$/.test(searchTerm)) {
        const value = parseFloat(searchTerm);

        return {
            $or: [
                { "data.temperature": value },
                { "data.humidity": value },
                { "data.light": value }
            ]
        };
    }
    return null;
}


module.exports = sensorController;