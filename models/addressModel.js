import mongoose from "mongoose";


const addressSchema = new mongoose.Schema({
    userId : {
        type:mongoose.Schema.Types.ObjectId,
        ref:"User" ,
        required:true
    },
    fullName:{
        type:String,
        required:true,
        trim:true
    },
    phone:{
        type:String,
        required:true,
        match: /^[0-9]{6,15}$/
    },
    altPhone:{
        type:String,
        match: /^[0-9]{6,15}$/
    },
    hoNo:{
        type:String,
        requried:true,
    },
    street:{
        type:String,
        required:true,
    },
    city:{
        type:String,
        required : true
    },
    state:{
        type:String,
        required:true,
    },
    pin:{
        type:String,
        required:true,
        match:/^[1-9][0-9]{5}$/
    },
    country:{
        type:String,
        enum: ["India", "USA", "UAE", "Canada", "UK"],
        required:true,
        default:"India"
    },
    geolocation:{
        type:String,
    },
    isDefault:{
        type:Boolean,
        required:true,
        default:false,
    },
    isDeleted:{
        type:Boolean,
        required:true,
        default:false,
    },
}) ;

export const addressSchemaExport = addressSchema;
export const Address =  mongoose.model("Address", addressSchema);