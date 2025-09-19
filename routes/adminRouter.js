import express from 'express'
import {isAuthenticatedAdmin} from '../middlewares/authMiddleware.js'
import {
    login, 
    getLogin ,
    getForgotPassword, 
    forgetPassword ,
    getDashboard,getOrders, 
    getProducts ,
    getAddProducts,
    postAddProducts,
    getEditProducts,
    postEditProduct,
    unlistProduct,
    deleteProduct,
    getcustomers,
    blockUser,
    getCategories, 
    addCategorie,
    DeactivateCategory,
    deleteCategory,
    editCategory,
} from '../controller/adminController.js'
import { pagination } from '../middlewares/paginationMiddleware.js';
import upload from '../middlewares/uploadMulter.js';

const router = express.Router() ;

router.get('/',getLogin) ;
router.post('/',login) ;

router.get('/forgot-password',getForgotPassword) ;

router.post('/forgot-password',forgetPassword) ;

router.get('/verify-otp',(req,res)=>{
    res.render('admin/otpForgetPassword');
}) 


router.get('/dashboard',isAuthenticatedAdmin,getDashboard) 

router.get('/orders',isAuthenticatedAdmin,getOrders) 

router.get('/products',isAuthenticatedAdmin,pagination,getProducts) 
router.get('/products/add-product',isAuthenticatedAdmin,getAddProducts)
router.post('/products/add-product',isAuthenticatedAdmin,upload.array('images',4),postAddProducts)
router.get('/products/edit-product/:id',isAuthenticatedAdmin,getEditProducts)
router.post('/products/edit-product/:id',isAuthenticatedAdmin, upload.array('images',4),postEditProduct)
router.post('/products/unlist/:id',isAuthenticatedAdmin,unlistProduct)
router.post('/products/delete/:id',isAuthenticatedAdmin,deleteProduct)

router.get('/customers',isAuthenticatedAdmin,pagination,getcustomers) 
router.post('/customers/block/:id',isAuthenticatedAdmin,blockUser)

router.get('/categories',pagination,isAuthenticatedAdmin,getCategories)  
router.post('/categories/addCategorie',isAuthenticatedAdmin,addCategorie)  
router.post('/categories/active/:id',isAuthenticatedAdmin,DeactivateCategory)
router.post('/categories/delete/:id',isAuthenticatedAdmin,deleteCategory)
router.post('/categories/edit/:id',isAuthenticatedAdmin,editCategory)

export default router