import React from 'react';

interface NetworkStatusIndicatorProps {
  online: boolean;
  supabaseReachable: boolean | null;
}

const NetworkStatusIndicator: React.FC<NetworkStatusIndicatorProps> = ({ 
  online, 
  supabaseReachable 
}) => {
  let statusText = '';
  let statusColor = '';
  let statusIcon = '';

  if (!online) {
    statusText = 'Offline';
    statusColor = 'bg-red-500';
    statusIcon = '⚠️';
  } else if (supabaseReachable === false) {
    statusText = 'Server Unreachable';
    statusColor = 'bg-orange-500';
    statusIcon = '⚠️';
  } else if (supabaseReachable === true) {
    statusText = 'Connected';
    statusColor = 'bg-green-500';
    statusIcon = '✅';
  } else {
    statusText = 'Checking Connection...';
    statusColor = 'bg-blue-500';
    statusIcon = '🔄';
  }

  return (
    <div className="flex items-center justify-center mb-4">
      <div className={`px-3 py-1 rounded-full text-white text-sm flex items-center ${statusColor}`}>
        <span className="mr-1">{statusIcon}</span>
        <span>{statusText}</span>
      </div>
    </div>
  );
};

export default NetworkStatusIndicator;
