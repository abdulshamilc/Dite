import mongoose from "mongoose";

const returnItemSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrderItem', // Assuming OrderItem model exists, or 'Product' if direct
    required: true
  },
  returnQty: {
    type: Number,
    required: true,
    min: 1
  },
  basePrice: {
    type: Number,
    required: true
  }
}, { _id: false });

const returnSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [returnItemSchema],
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  reason: {
    type: String,
    required: true,
    maxlength: 500 // As per validation in frontend
  },
  comments: {
    type: String,
    maxlength: 1000 // Optional, can adjust
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'approved', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  estimatedRefund: {
    type: Number,
    default: 0
  },
  actualRefund: {
    type: Number,
    default: 0
  },
  refundProcessed: {
    type: Boolean,
    default: false
  },
  trackingNumber: {
    type: String
  },
  returnLabelUrl: {
    type: String
  }
}, {
  timestamps: true
});


const Return = mongoose.model('Return', returnSchema);
export default Return ;