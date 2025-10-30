import mongoose from "mongoose";

const AdminlogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    browser: {
      type: String,
      required: true,
    },
    loginTime: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    capped: { size: 15 * 1024 * 1024 }, 
  }
);

const AdminLog = mongoose.model("AdminLog", AdminlogSchema);

export default AdminLog;
