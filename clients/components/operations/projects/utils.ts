// Status badge styling
export const getStatusClassName = (status: string): string => {
  switch (status) {
    case "In progress":
      return "bg-[#0E5D5D] text-white";
    case "Completed":
      return "bg-[#4FD1C5] text-[#0B1215]";
    case "Pending":
      return "bg-[#BD7A22] text-white";
    default:
      return "bg-gray-100 text-gray-600";
  }
};

// Priority badge styling
export const getPriorityClassName = (priority: string): string => {
  switch (priority) {
    case "High":
      return "bg-[#A3E635] text-[#0B1215]";
    case "Medium":
      return "bg-[#FDE047] text-[#0B1215]";
    case "Low":
      return "bg-[#CBD5E1] text-[#0B1215]";
    default:
      return "bg-gray-100 text-gray-600";
  }
};

// Performance label based on percentage
export const getPerformanceLabel = (percent: number): string => {
  if (percent >= 80) return "Excellent";
  if (percent >= 60) return "Good";
  if (percent >= 40) return "Fair";
  return "Poor";
};
