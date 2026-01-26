import { Admin } from "../../models/adminModels.js";
import { ERROR_MESSAGES, SUCCESS_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

// Get Admin Profile
const getProfile = async (req, res) => {
  try {
    const adminId = req.session.admin.id;
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.redirect("/admin/login");
    }

    // Fetch active sessions from MongoDB collection 'sessions'
    const sessionCollection = mongoose.connection.collection("sessions");
    // We search for sessions that contain the admin ID in their JSON string
    const sessions = await sessionCollection.find({
      session: { $regex: adminId } 
    }).toArray();

    const activeSessions = sessions.map(s => {
        try {
            const sessionData = JSON.parse(s.session);
            // Only include if it's actually this admin (double check)
            if (sessionData.admin && sessionData.admin.id === adminId) {
                return {
                    id: s._id,
                    lastAccess: s.expires ? new Date(s.expires - (24 * 60 * 60 * 1000)) : new Date(), // Approximate last access based on expiry (assuming 24h ttl) or just use current if not reliable. 
                    // Better: The 'expires' field in store is when it expires. 'lastModified' might be available if using touch. 
                    // Let's just use expires.
                    device: "Unknown Device", // connect-mongo doesn't store UA by default unless configured. We'll default to this.
                    isCurrent: s._id === req.sessionID
                };
            }
        } catch (e) { return null; }
    }).filter(s => s !== null);

    res.render("admin/profile/profile", {
      admin,
      pageTitle: "Admin Profile",
      activeSessions,
      is2FAEnabled: admin.twoFactorAuth
    });
  } catch (error) {
    console.error("Get admin profile error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("admin/pageNotFound");
  }
};

// End a specific session
const endSession = async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, message: "Session ID required" });

        const sessionCollection = mongoose.connection.collection("sessions");
        await sessionCollection.deleteOne({ _id: sessionId });

        return res.json({ success: true, message: "Session ended successfully" });
    } catch (error) {
        console.error("End session error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}

// Generate 2FA Secret
const generate2FA = async (req, res) => {
    try {
        const adminId = req.session.admin.id;
        const admin = await Admin.findById(adminId);
        
        const secret = speakeasy.generateSecret({
            name: `Dité Admin (${admin.email})`
        });

        // Store temp secret in session
        req.session.tempAdmin2FASecret = secret.base32;

        QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
            if (err) return res.status(500).json({ success: false, message: "Error generating QR" });
            
            res.json({
                success: true,
                secret: secret.base32,
                qrCode: data_url
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// Verify and Enable 2FA
const enable2FA = async (req, res) => {
    try {
        const { token } = req.body;
        const tempSecret = req.session.tempAdmin2FASecret;

        if (!tempSecret) return res.status(400).json({ success: false, message: "Session expired, please regenerate QR" });

        const verified = speakeasy.totp.verify({
            secret: tempSecret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            const adminId = req.session.admin.id;
            await Admin.findByIdAndUpdate(adminId, {
                twoFactorAuth: true,
                twoFactorSecret: tempSecret
            });
            delete req.session.tempAdmin2FASecret;
            return res.json({ success: true, message: "2FA Enabled Successfully" });
        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// Disable 2FA
const disable2FA = async (req, res) => {
    try {
        const { password, token } = req.body; // Requiring password for extra security
        const adminId = req.session.admin.id;
        const admin = await Admin.findById(adminId);

        // Verify password
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Incorrect password" });

        // Verify OTP
        const verified = speakeasy.totp.verify({
            secret: admin.twoFactorSecret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            admin.twoFactorAuth = false;
            admin.twoFactorSecret = null;
            await admin.save();
            return res.json({ success: true, message: "2FA Disabled Successfully" });
        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}


// Change Admin Password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const adminId = req.session.admin.id;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "All fields are required.",
      });
    }

    if (newPassword.length < 8) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: "Password must be at least 8 characters long.",
        });
    }

    if (newPassword !== confirmPassword) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "New password and confirm password do not match.",
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Incorrect current password.",
      });
    }

    if (currentPassword === newPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: "New password cannot be the same as the old password.",
        });
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(newPassword, salt);
    await admin.save();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change admin password error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
};

export { getProfile, changePassword, endSession, generate2FA, enable2FA, disable2FA };
