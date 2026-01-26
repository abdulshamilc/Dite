import mongoose from "mongoose";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Others" ,"Not" ],
    },
    image:{
      type: String,
      default: "/images/icons/DefaultProfile.jpg"
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    twoFactorAuth:{
      type:Boolean,
      default:false,
      required:true
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true, 
    },
    referredBy: {
      type: String,
    },
    redeemedUsers: [{
      type: String,
    }],
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);


const userOtpVerificationSchema = new mongoose.Schema({
  email:{
    type:String,
    required:true,
  },
  action:{
    type:String,
    required : true
  },
  otp:{
    type:Number
  },
  resetToken:{
    type:String
  },
  createdAt:{
    type:Date,
    default:Date.now,
    expires:300    
  },
})


const User = mongoose.model("User", userSchema);
const UserOtpVerification = mongoose.model("UserOtpVerificationSchema", userOtpVerificationSchema);

export{User ,UserOtpVerification} 