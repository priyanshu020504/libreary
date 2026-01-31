export interface Student {
  id: number;
  name: string;
  mobile: string;
  membership_start_date: string;
  membership_end_date: string;
  monthly_due_date: number;
  created_at?: string;
}

export interface Payment {
  id: number;
  student_id: number;
  amount: number;
  payment_date: string;
  status: 'paid' | 'pending';
  month: number;
  year: number;
  created_at?: string;
}

export interface PaymentStats {
  monthlyFee: number;
  membershipStartDate: string;
  membershipEndDate: string;
  monthlyDueDate: number;
  totalPaid: number;
  totalExpected: number;
  remaining: number;
  paidCount: number;
  paymentStatus: 'paid' | 'pending';
  payments: Payment[];
}

export interface DashboardStats {
  totalStudents: number;
  totalPayments: number;
  totalRevenue: number;
  paidStudents: number;
  pendingStudents: number;
}

export interface User {
  id: number;
  name?: string;
  username?: string;
  mobile?: string;
  role: 'student' | 'admin';
}

export interface AuthResponse {
  token: string;
  user: User;
}
