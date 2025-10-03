import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ["superadmin", "admin"], // 
      default: "admin",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    verify:{
      
    }
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);


const admiResetPasswordSchema = new mongoose.Schema({
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

export const Admin =  mongoose.model("Admin", adminSchema);
export const AdmiResetPassword =  mongoose.model("AdmiResetPassword", admiResetPasswordSchema);
