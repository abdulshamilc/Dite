const isAuthenticatedAdmin = (req,res,next)=>{
    if(req.session && req.session.admin){
        return next() ;
    }
    else{
         return res.redirect("/admin");
    }
}


const isAuthenticatedUser = (req,res,next)=>{
    if(req.session && req.session.user){
        return next() ;
    }
    else{
        return res.redirect('/login') ;
    }
}


export {
    isAuthenticatedAdmin,
    isAuthenticatedUser
}