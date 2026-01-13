import Notification from "../../models/notificationModel.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

// Get all notifications
const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ createdAt: -1 });
        const unreadCount = await Notification.countDocuments({ isRead: false });
        res.status(HTTP_STATUS.OK).json({ notifications, unreadCount });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.NOTIFICATION_FETCH_ERROR });
    }
};

// Mark a single notification as read
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndUpdate(id, { isRead: true });
        res.status(HTTP_STATUS.OK).json({ message: SUCCESS_MESSAGES.NOTIFICATION_READ });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.NOTIFICATION_UPDATE_ERROR });
    }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany({ isRead: false }, { isRead: true });
        res.status(HTTP_STATUS.OK).json({ message: SUCCESS_MESSAGES.ALL_NOTIFICATIONS_READ });
    } catch (error) {
        console.error("Error marking all as read:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.NOTIFICATIONS_UPDATE_ERROR });
    }
};

// Clear all read notifications
const clearReadNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ isRead: true });
        res.status(HTTP_STATUS.OK).json({ message: SUCCESS_MESSAGES.NOTIFICATIONS_CLEARED });
    } catch (error) {
        console.error("Error clearing notifications:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.NOTIFICATIONS_CLEAR_ERROR });
    }
}

export default {
    getNotifications,
    markAsRead,
    markAllAsRead,
    clearReadNotifications
};
