'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import StudentDetailModal from './StudentDetailModal';
import PaymentModal from './PaymentModal';

interface Student {
  id: number;
  name: string;
  mobile: string;
  parent_mobile?: string;
  address?: string;
  batch?: string;
  membership_start_date: string;
  membership_end_date: string;
  monthly_due_date: number;
  paymentStatus?: 'paid' | 'pending';
  totalFee?: number;
  remaining?: number;
}

export default function StudentsList({ onEdit, onRefresh }: { onEdit: (student: Student) => void; onRefresh: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, [search, page]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await api.get('/students', {
        params: { search, page, limit: 10 }
      });
      setStudents(response.data.students);
      setTotalPages(response.data.pagination.pages);
    } catch (error: any) {
      toast.error('Failed to load students');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this student?')) {
      return;
    }

    try {
      await api.delete(`/students/${id}`);
      toast.success('Student deleted successfully');
      fetchStudents();
      onRefresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete student');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or mobile..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No students found</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Name</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Mobile</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Parent Mobile</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Batch</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Payment Status</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Start Date</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">End Date</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900 font-medium">{student.name}</td>
                    <td className="py-3 px-4 text-gray-600">{student.mobile}</td>
                    <td className="py-3 px-4 text-gray-600">{student.parent_mobile || '-'}</td>
                    <td className="py-3 px-4 text-gray-600">{student.batch ? `${student.batch.charAt(0).toUpperCase() + student.batch.slice(1)}` : '-'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        student.paymentStatus === 'paid' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {student.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {format(new Date(student.membership_start_date), 'dd MMM yyyy')}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {format(new Date(student.membership_end_date), 'dd MMM yyyy')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedStudent(student)}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEdit(student)}
                          className="text-green-600 hover:text-green-700 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStudent(student);
                            setShowPaymentModal(true);
                          }}
                          className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                        >
                          Payment
                        </button>
                        <button
                          onClick={() => handleDelete(student.id)}
                          className="text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {selectedStudent && !showPaymentModal && (
        <StudentDetailModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onRefresh={onRefresh}
        />
      )}

      {selectedStudent && showPaymentModal && (
        <PaymentModal
          student={selectedStudent}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedStudent(null);
          }}
          onSuccess={() => {
            setShowPaymentModal(false);
            setSelectedStudent(null);
            fetchStudents();
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
