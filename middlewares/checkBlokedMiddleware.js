import User from "../models/userModels.js";


const isBlocked = async(req,res,next)=>{
    const user = await User.findOne({email:req.session.user}) ;

    if(user.isBlocked){
        delete req.session.user ;
      return res.redirect("/userBloked"); 
    }
   else next();
}


export default isBlocked 
