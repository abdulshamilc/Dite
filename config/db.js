import mongoose from "mongoose"
const connectDB = async()=>{
    try{
        const conn =await mongoose.connect(process.env.CONNECTION_STRING ,{})
        console.log(`mongodb connected: ${conn.connection.host}`)
    }catch (error){
        console.log(error)
        process.exit(1)
    }
}
export default connectDB ;

