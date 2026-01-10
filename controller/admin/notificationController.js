import Notification from "../../models/notificationModel.js";

// Get all notifications
const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ createdAt: -1 });
        const unreadCount = await Notification.countDocuments({ isRead: false });
        res.status(200).json({ notifications, unreadCount });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ message: "Failed to fetch notifications" });
    }
};

// Mark a single notification as read
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndUpdate(id, { isRead: true });
        res.status(200).json({ message: "Notification marked as read" });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).json({ message: "Failed to update notification" });
    }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany({ isRead: false }, { isRead: true });
        res.status(200).json({ message: "All notifications marked as read" });
    } catch (error) {
        console.error("Error marking all as read:", error);
        res.status(500).json({ message: "Failed to update notifications" });
    }
};

// Clear all read notifications
const clearReadNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ isRead: true });
        res.status(200).json({ message: "Read notifications cleared" });
    } catch (error) {
        console.error("Error clearing notifications:", error);
        res.status(500).json({ message: "Failed to clear notifications" });
    }
}

export default {
    getNotifications,
    markAsRead,
    markAllAsRead,
    clearReadNotifications
};
