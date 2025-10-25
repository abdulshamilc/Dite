import express from 'express'
import {isAuthenticatedAdmin} from '../middlewares/authMiddleware.js'
import {
    pageNotFound,
    login, 
    getLogin ,
    getForgotPassword, 
    forgetPassword ,
    getOtpVerification,
    PostOtpVerification,
    getResetPasword,
    postResetPassword,
    getDashboard,getOrders, 
    getProducts ,
    getAddProducts,
    postAddProducts,
    getEditProducts,
    postEditProduct,
    unlistProduct,
    deleteProduct,
    getSaleReport,
    getcustomers,
    blockUser,
    getCategories, 
    addCategorie,
    DeactivateCategory,
    deleteCategory,
    editCategory,
    logOut,
} from '../controller/admin/adminController.js'
import { pagination } from '../middlewares/paginationMiddleware.js';
import upload from '../middlewares/uploadMulter.js';

const router = express.Router() ;

router.get('/',getLogin) ;
router.post('/',login) ;

router.get('/forgot-password',getForgotPassword) ;

router.post('/forgot-password',forgetPassword) ;

router.get('/verify-otp',getOtpVerification)
router.post('/verify-otp',PostOtpVerification)

router.get('/reset-password/:token',getResetPasword)
router.post('/reset-password/:token',postResetPassword)

router.get('/dashboard',isAuthenticatedAdmin,getDashboard) 

router.get('/orders',isAuthenticatedAdmin,pagination,getOrders) 

router.get('/products',isAuthenticatedAdmin,pagination,getProducts) 
router.get('/products/add-product',isAuthenticatedAdmin,getAddProducts)
router.post('/products/add-product',isAuthenticatedAdmin,upload.array('images',4),postAddProducts)
router.get('/products/edit-product/:id',isAuthenticatedAdmin,getEditProducts)
router.post('/products/edit-product/:id',isAuthenticatedAdmin, upload.array('images',4),postEditProduct)
router.post('/products/unlist/:id',isAuthenticatedAdmin,unlistProduct)
router.post('/products/delete/:id',isAuthenticatedAdmin,deleteProduct)

router.get('/sales',isAuthenticatedAdmin,pagination,getSaleReport) 

router.get('/customers',isAuthenticatedAdmin,pagination,getcustomers) 
router.post('/customers/block/:id',isAuthenticatedAdmin,blockUser)

router.get('/categories',pagination,isAuthenticatedAdmin,getCategories)  
router.post('/categories/addCategorie',isAuthenticatedAdmin,addCategorie)  
router.post('/categories/active/:id',isAuthenticatedAdmin,DeactivateCategory)
router.post('/categories/delete/:id',isAuthenticatedAdmin,deleteCategory)
router.post('/categories/edit/:id',isAuthenticatedAdmin,editCategory)


router.get('/coupons',isAuthenticatedAdmin,pageNotFound)  
router.get('/refunds',isAuthenticatedAdmin,pageNotFound)  
router.get('/banners',isAuthenticatedAdmin,pageNotFound)  
router.get('/referrals',isAuthenticatedAdmin,pageNotFound)  

router.get('/logout',logOut)
export default router