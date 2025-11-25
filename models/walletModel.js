import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  amount: {
    type: Number,
    required: true,
    min: -999999.99,
    max: 999999.99
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    default: 'credit'
  },
  date: {
    type: Date,
    default: Date.now
  },
  referenceId: {
    type: String,
    sparse: true
  },
  source: {
    type: String,
    enum: ['add_funds', 'purchase', 'withdrawal', 'transfer', 'refund'],
    default: 'add_funds'
  }
});

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    required: true,
    default: 0.00,
    min: 0.00
  },
  transactions: [transactionSchema],
  currency: {
    type: String,
    default: 'USD',
    uppercase: true,
    trim: true
  }
}, {
  timestamps: true
});

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;