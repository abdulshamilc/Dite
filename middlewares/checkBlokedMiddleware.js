import {User} from "../models/userModels.js";


const isBlocked = async(req,res,next)=>{
    const user = await User.findOne({email:req.session.user}) ;

    if (!user) {
        // User not found in DB - invalid session or phantom user
        delete req.session.user;
        return res.redirect("/login");
    }

    if(user.isBlocked){
        delete req.session.user ;
      return res.redirect("/userBloked"); 
    }
   else next();
}


export default isBlocked 
