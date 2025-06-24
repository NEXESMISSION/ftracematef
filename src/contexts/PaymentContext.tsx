import React, { createContext, useContext, useState, ReactNode } from 'react';

export type PaymentPlan = 'monthly' | 'lifetime';

interface PaymentContextType {
  selectedPlan: PaymentPlan | null;
  setSelectedPlan: (plan: PaymentPlan | null) => void;
  clearSelectedPlan: () => void;
  isPaymentFlow: boolean;
  setIsPaymentFlow: (isPayment: boolean) => void;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

export const usePayment = () => {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};

interface PaymentProviderProps {
  children: ReactNode;
}

export const PaymentProvider: React.FC<PaymentProviderProps> = ({ children }) => {
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
  const [isPaymentFlow, setIsPaymentFlow] = useState(false);

  const clearSelectedPlan = () => {
    setSelectedPlan(null);
    setIsPaymentFlow(false);
  };

  return (
    <PaymentContext.Provider
      value={{
        selectedPlan,
        setSelectedPlan,
        clearSelectedPlan,
        isPaymentFlow,
        setIsPaymentFlow,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
}; 