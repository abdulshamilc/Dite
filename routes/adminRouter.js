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
    getDashboard,
    getOrders,
    getViewOrders, 
    updateOrderStatus,
    getProducts ,
    getProductDetails,
    getAddProducts,
    postAddProducts,
    getEditProducts,
    postEditProduct,
    unlistProduct,
    deleteProduct,
    getSalesReport,
    exportSalesReport,
    exportSalesPdf,
    getcustomers,
    blockUser,
    getCategories, 
    addCategorie,
    DeactivateCategory,
    deleteCategory,
    editCategory,
    getReturnDetails,
    getReturn,
    returnApprove,
    returnReject,
    getOffers,
    createOffer,
    getOfferDetails,
    toggleOfferStatus,
    updateOfferEndDate,
    getEditOffer,
    postEditOffer,
    deleteOffer,
    getCoupons,
    createCoupon,
    getCouponDetails,
    toggleCouponStatus,
    updateCouponEndDate,
    getEditCoupon,
    postEditCoupon,
    deleteCoupon,
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
router.get('/orders/view/:id',isAuthenticatedAdmin,pagination,getViewOrders) 
router.post('/orders/:id/status',isAuthenticatedAdmin,pagination,updateOrderStatus) 

router.get('/products/add-product',isAuthenticatedAdmin,getAddProducts)
router.post('/products/add-product',isAuthenticatedAdmin,upload.array('images',4),postAddProducts)
router.get('/products',isAuthenticatedAdmin,pagination,getProducts) 
router.get('/products/:id',isAuthenticatedAdmin,pagination,getProductDetails) 
router.get('/products/edit-product/:id',isAuthenticatedAdmin,getEditProducts)
router.post('/products/edit-product/:id',isAuthenticatedAdmin, upload.array('images'
    ,4),postEditProduct)
router.post('/products/unlist/:id',isAuthenticatedAdmin,unlistProduct)
router.post('/products/delete/:id',isAuthenticatedAdmin,deleteProduct)

router.get('/sales',isAuthenticatedAdmin,pagination,getSalesReport)
router.post('/sales-report/export',isAuthenticatedAdmin,exportSalesReport) 
router.post('/sales-report/export-pdf',isAuthenticatedAdmin,exportSalesPdf) 

router.get('/customers',isAuthenticatedAdmin,pagination,getcustomers) 
router.post('/customers/block/:id',isAuthenticatedAdmin,blockUser)

router.get('/categories',pagination,isAuthenticatedAdmin,getCategories)  
router.post('/categories/addCategorie',isAuthenticatedAdmin,addCategorie)  
router.post('/categories/active/:id',isAuthenticatedAdmin,DeactivateCategory)
router.post('/categories/delete/:id',isAuthenticatedAdmin,deleteCategory)
router.post('/categories/edit/:id',isAuthenticatedAdmin,editCategory)



router.get('/coupons',isAuthenticatedAdmin,getCoupons)  
router.post('/coupons/add',isAuthenticatedAdmin,createCoupon)  
router.get('/coupons/:id',isAuthenticatedAdmin,getCouponDetails) 
router.get('/coupons/edit/:id',isAuthenticatedAdmin,getEditCoupon)
router.post('/coupons/edit/:id',isAuthenticatedAdmin,postEditCoupon)
router.post('/coupons/:id/toggleStatus',isAuthenticatedAdmin,toggleCouponStatus)  
router.post('/coupons/update-end-date/:id',isAuthenticatedAdmin,updateCouponEndDate)  
router.post('/coupons/delete/:id',isAuthenticatedAdmin,deleteCoupon)  

router.get('/return',isAuthenticatedAdmin,getReturn) 
router.get('/return/:orderId/',isAuthenticatedAdmin,getReturnDetails) 
router.post('/return/:orderId/approve',isAuthenticatedAdmin,returnApprove) 
router.post('/return/:orderId/reject',isAuthenticatedAdmin,returnReject) 

router.get('/offers',isAuthenticatedAdmin,getOffers)  
router.post('/offers',isAuthenticatedAdmin,createOffer)  
router.get('/offers/:id',isAuthenticatedAdmin,getOfferDetails)  
router.get('/offers/edit/:id',isAuthenticatedAdmin,getEditOffer)
router.post('/offers/edit/:id',isAuthenticatedAdmin,postEditOffer)
router.post('/offers/:id/toggleStatus',isAuthenticatedAdmin,toggleOfferStatus)  
router.post('/offers/update-end-date/:id',isAuthenticatedAdmin,updateOfferEndDate)  
router.post('/offers/delete/:id',isAuthenticatedAdmin,deleteOffer)  

router.get('/theme',isAuthenticatedAdmin,pageNotFound)  

router.get('/logout',logOut)
export default router