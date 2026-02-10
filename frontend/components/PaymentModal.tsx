'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function PaymentModal({ student, onClose, onSuccess }: { student: any; onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    paid_amount: '0',
  });
  const [totalFee, setTotalFee] = useState(400);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Prefill from student row if present
    setFormData({
      paid_amount: String(student.paid_amount ?? 0),
    });
    // Fixed monthly membership fee
    setTotalFee(400);
  }, [student]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.patch(`/api/students/${student.id}/payment-totals`, {
        paid_amount: parseFloat(formData.paid_amount),
      });
      toast.success('Payment updated successfully');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update payment');
    } finally {
      setLoading(false);
    }
  };

  const paidAmount = parseFloat(formData.paid_amount || '0');
  const remaining = Math.max(0, totalFee - paidAmount);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Payment (Display Only)</h2>
          <p className="text-sm text-gray-600 mt-1">{student.name} - {student.mobile}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium">Monthly Membership Fee: ₹{totalFee.toFixed(2)}</p>
            <p className="text-xs text-blue-700 mt-1">Fixed monthly fee (cannot be changed)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Paid Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={totalFee}
              value={formData.paid_amount}
              onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Enter how much the student has paid</p>
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-700">Remaining Fee:</span>
              <span className={`text-lg font-bold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ₹{remaining.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-gray-500">Remaining = Total Fee - Paid Amount</p>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
