
import express from 'express'
import {isAuthenticatedAdmin} from '../middlewares/authMiddleware.js'
import { pagination } from '../middlewares/paginationMiddleware.js';
import upload from '../middlewares/uploadMulter.js';

import {
    pageNotFound,
    login, 
    getLogin,
    getForgotPassword, 
    forgetPassword,
    getOtpVerification,
    PostOtpVerification,
    getResetPasword,
    postResetPassword,
    logOut,
    get2FAVerify,
    post2FAVerify
} from '../controller/admin/adminController.js';

import { getDashboard } from '../controller/admin/dashboardController.js';
import { getProfile, changePassword, endSession, generate2FA, enable2FA, disable2FA } from '../controller/admin/adminProfileController.js';

import {
    getOrders,
    getViewOrders, 
    updateOrderStatus,
    exportOrderPDF
} from '../controller/admin/ordersController.js';

import {
    getProducts,
    getProductDetails,
    getAddProducts,
    postAddProducts,
    getEditProducts,
    postEditProduct,
    unlistProduct,
    deleteProduct
} from '../controller/admin/productsContrller.js';

import {
    getSalesReport,
    exportSalesReport,
    exportSalesPdf
} from '../controller/admin/salesController.js';

import {
    getcustomers,
    blockUser,
    customerDetails,
    getDeletedUsers,
    getDeletedUserDetails
} from '../controller/admin/customerController.js';

import {
    getCategories, 
    addCategorie,
    DeactivateCategory,
    deleteCategory,
    editCategory,
    getCategoryDetails
} from '../controller/admin/categoriesController.js';

import {
    getReturnDetails,
    getReturn,
    returnApprove,
    returnReject
} from '../controller/admin/returnController.js';

import {
    getOffers,
    createOffer,
    getOfferDetails,
    toggleOfferStatus,
    updateOfferEndDate,
    getEditOffer,
    postEditOffer,
    deleteOffer
} from '../controller/admin/offerController.js';

import {
    getCoupons,
    createCoupon,
    getCouponDetails,
    toggleCouponStatus,
    updateCouponEndDate,
    getEditCoupon,
    postEditCoupon,
    deleteCoupon
} from '../controller/admin/couponsController.js';

import notificationController from '../controller/admin/notificationController.js';

const router = express.Router() ;

// Auth
router.get('/',getLogin) ;
router.post('/',login) ;

// 2FA Verification during login
router.get('/verify-2fa', get2FAVerify);
router.post('/verify-2fa', post2FAVerify);

router.get('/forgot-password',getForgotPassword) ;

router.post('/forgot-password',forgetPassword) ;

router.get('/verify-otp',getOtpVerification)
router.post('/verify-otp',PostOtpVerification)

router.get('/reset-password/:token',getResetPasword)
router.post('/reset-password/:token',postResetPassword)

// Dashboard
router.get('/dashboard',isAuthenticatedAdmin,getDashboard) 

// Profile
router.get('/profile', isAuthenticatedAdmin, getProfile);
router.post('/profile/change-password', isAuthenticatedAdmin, changePassword); 
router.post('/profile/end-session', isAuthenticatedAdmin, endSession);
router.post('/profile/2fa/generate', isAuthenticatedAdmin, generate2FA);
router.post('/profile/2fa/enable', isAuthenticatedAdmin, enable2FA);
router.post('/profile/2fa/disable', isAuthenticatedAdmin, disable2FA); 

// Orders
router.get('/orders',isAuthenticatedAdmin,pagination,getOrders) 
router.get('/orders/view/:id',isAuthenticatedAdmin,pagination,getViewOrders) 
router.post('/orders/:id/status',isAuthenticatedAdmin,pagination,updateOrderStatus) 
router.get('/orders/:id/export',isAuthenticatedAdmin,exportOrderPDF) 

// Products
router.get('/products/add-product',isAuthenticatedAdmin,getAddProducts)
router.post('/products/add-product',isAuthenticatedAdmin,upload.array('images',4),postAddProducts)
router.get('/products',isAuthenticatedAdmin,pagination,getProducts) 
router.get('/products/:id',isAuthenticatedAdmin,pagination,getProductDetails) 
router.get('/products/edit-product/:id',isAuthenticatedAdmin,getEditProducts)
router.post('/products/edit-product/:id',isAuthenticatedAdmin, upload.array('images'
    ,4),postEditProduct)
router.post('/products/unlist/:id',isAuthenticatedAdmin,unlistProduct)
router.post('/products/delete/:id',isAuthenticatedAdmin,deleteProduct)

// Sales
router.get('/sales',isAuthenticatedAdmin,pagination,getSalesReport)
router.post('/sales-report/export',isAuthenticatedAdmin,exportSalesReport) 
router.post('/sales-report/export-pdf',isAuthenticatedAdmin,exportSalesPdf) 

// Customers
router.get('/customers',isAuthenticatedAdmin,pagination,getcustomers) 
router.get('/customers/deleted',isAuthenticatedAdmin,pagination,getDeletedUsers)
router.get('/customers/deleted/:id',isAuthenticatedAdmin,getDeletedUserDetails)
router.post('/customers/block/:id',isAuthenticatedAdmin,blockUser)
router.get('/customers/:id',isAuthenticatedAdmin,customerDetails)

// Categories
router.get('/categories',pagination,isAuthenticatedAdmin,getCategories)  
router.get('/categories/:id',isAuthenticatedAdmin,getCategoryDetails)
router.post('/categories/addCategorie',isAuthenticatedAdmin,addCategorie)  
router.post('/categories/active/:id',isAuthenticatedAdmin,DeactivateCategory)
router.post('/categories/delete/:id',isAuthenticatedAdmin,deleteCategory)
router.post('/categories/edit/:id',isAuthenticatedAdmin,editCategory)

// Coupons
router.get('/coupons',isAuthenticatedAdmin,getCoupons)  
router.post('/coupons/add',isAuthenticatedAdmin,createCoupon)  
router.get('/coupons/:id',isAuthenticatedAdmin,getCouponDetails) 
router.get('/coupons/edit/:id',isAuthenticatedAdmin,getEditCoupon)
router.post('/coupons/edit/:id',isAuthenticatedAdmin,postEditCoupon)
router.post('/coupons/:id/toggleStatus',isAuthenticatedAdmin,toggleCouponStatus)  
router.post('/coupons/update-end-date/:id',isAuthenticatedAdmin,updateCouponEndDate)  
router.post('/coupons/delete/:id',isAuthenticatedAdmin,deleteCoupon)  

// Returns
router.get('/return',isAuthenticatedAdmin,getReturn) 
router.get('/return/:orderId/',isAuthenticatedAdmin,getReturnDetails) 
router.post('/return/:orderId/approve',isAuthenticatedAdmin,returnApprove) 
router.post('/return/:orderId/reject',isAuthenticatedAdmin,returnReject) 

// Offers
router.get('/offers',isAuthenticatedAdmin,getOffers)  
router.post('/offers',isAuthenticatedAdmin,createOffer)  
router.get('/offers/:id',isAuthenticatedAdmin,getOfferDetails)  
router.get('/offers/edit/:id',isAuthenticatedAdmin,getEditOffer)
router.post('/offers/edit/:id',isAuthenticatedAdmin,postEditOffer)
router.post('/offers/:id/toggleStatus',isAuthenticatedAdmin,toggleOfferStatus)  
router.post('/offers/update-end-date/:id',isAuthenticatedAdmin,updateOfferEndDate)  
router.post('/offers/delete/:id',isAuthenticatedAdmin,deleteOffer)  




// Notifications
router.get('/notifications', isAuthenticatedAdmin, notificationController.getNotifications);
router.patch('/notifications/:id/read', isAuthenticatedAdmin, notificationController.markAsRead);
router.patch('/notifications/read-all', isAuthenticatedAdmin, notificationController.markAllAsRead);
router.delete('/notifications/clear-read', isAuthenticatedAdmin, notificationController.clearReadNotifications);

// Logout
router.get('/logout',logOut)
export default router