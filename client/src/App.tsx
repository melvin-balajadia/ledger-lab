import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Replenishments } from './pages/Replenishments';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { CashAdvances } from './pages/CashAdvances';
import { AdditionalPayments } from './pages/AdditionalPayments';
import { BudgetItemDetail } from './pages/BudgetItemDetail';
import { Payroll } from './pages/Payroll';
import { PayrollPeriodDetail } from './pages/PayrollPeriodDetail';
import { WorkerPayrollDetail } from './pages/WorkerPayrollDetail';
import { Suppliers } from './pages/Suppliers';

function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="replenishments" element={<Replenishments />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="cash-advances" element={<CashAdvances />} />
          <Route path="additional-payments" element={<AdditionalPayments />} />
          <Route path="budget-items/:id" element={<BudgetItemDetail />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="payroll/workers/:id" element={<WorkerPayrollDetail />} />
          <Route path="payroll/:id" element={<PayrollPeriodDetail />} />
          <Route path="suppliers" element={<Suppliers />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
