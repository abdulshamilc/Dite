import { UserOtpVerification } from '../models/userModels.js'
import sendMail from '../services/mailer.js' ;

const generateOTP = async (email, subject, text, action) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log("Generated OTP:", otp);

    await sendMail({
      to: email,
      subject: subject || "Your OTP Code",
      text: `${text || "Your OTP code is"} ${otp}`,
      html: `<p>Your OTP code is <b>${otp}</b></p>`,
    });

    await UserOtpVerification.create({
      email,
      action: action || "General Action",
      otp,
    });

    return otp; 
  } catch (error) {
    console.error("Error in generating OTP:", error);
    throw error;
  }
};

export { generateOTP };
