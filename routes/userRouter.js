import express from 'express' ;
import {
    notLogginedHome,
    signup,
    login,
    getShop,
    productDetail
    
} from '../controller/userController.js'

const router = express.Router() ;

router.get('/',notLogginedHome);
router.get('/signup', (req, res) => {
  // On first load, there are no errors and no old data
  res.render('user/signup', { errors: {}, oldData: {} });
});

router.post('/signup',signup);
router.get('/login',(req, res) => {
  res.render("user/login", { errors: {}, oldData: {} });
});
router.post('/login',login);

router.get('/shop',getShop);
router.get('/shop/:id',productDetail);

export default router 
