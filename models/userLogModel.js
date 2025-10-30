import mongoose from "mongoose";

const UserlogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    device: {
      type: String, 
      required: false,
    },
    location: {
      type: String, 
    },
    loginTime: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    capped: { size: 15 * 1024 * 1024 },
    timestamps: true,
  }
);

const UserLog = mongoose.model("UserLog", UserlogSchema);

export default UserLog;
