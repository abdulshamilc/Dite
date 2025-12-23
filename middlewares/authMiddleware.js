const isAuthenticatedAdmin = (req,res,next)=>{
    if(req.session && req.session.admin){
        return next() ;
    }
    else{
         if(req.method === "GET"){
             req.session.returnToAdmin = req.originalUrl;
         } else {
             req.session.returnToAdmin = req.get('Referer') || "/admin";
         }
         return res.redirect("/admin");
    }
}


const isAuthenticatedUser = (req,res,next)=>{
    if(req.session && req.session.user){
        return next() ;
    }
    else{
        if(req.method === "GET"){
            req.session.returnTo = req.originalUrl;
        } else {
             req.session.returnTo = req.get('Referer') || "/";
        }
        return res.redirect('/login') ;
    }
}


export {
    isAuthenticatedAdmin,
    isAuthenticatedUser
}