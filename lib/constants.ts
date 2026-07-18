export const SITE_NAME = "Dar Al Hay Events";

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Registration Open",
  closed: "Registration Closed",
  archived: "Archived",
};

export const EVENT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700 border-neutral-300",
  open: "bg-emerald-100 text-emerald-800 border-emerald-300",
  closed: "bg-amber-100 text-amber-800 border-amber-300",
  archived: "bg-neutral-200 text-neutral-600 border-neutral-300",
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  profile_incomplete: "Profile Incomplete",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  blacklisted: "Blacklisted",
};

export const APPROVAL_STATUS_COLORS: Record<string, string> = {
  profile_incomplete: "bg-neutral-100 text-neutral-700 border-neutral-300",
  pending_review: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  suspended: "bg-orange-100 text-orange-800 border-orange-300",
  blacklisted: "bg-neutral-900 text-white border-neutral-900",
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  booth_selection_available: "Booth Selection Available",
  booth_selected: "Booth Selected",
  awaiting_payment: "Awaiting Payment",
  payment_under_review: "Payment Under Review",
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const BOOTH_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  locked: "Temporarily Locked",
  reserved: "Reserved",
  awaiting_payment: "Awaiting Payment",
  confirmed: "Confirmed",
  admin_held: "Admin Held",
  blocked: "Blocked",
  unavailable: "Unavailable",
};

export const BOOTH_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500",
  locked: "bg-amber-500",
  reserved: "bg-blue-500",
  awaiting_payment: "bg-orange-500",
  confirmed: "bg-violet-600",
  admin_held: "bg-slate-500",
  blocked: "bg-red-600",
  unavailable: "bg-neutral-400",
};

export const BOOTH_STATUS_BADGE_COLORS: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-800 border-emerald-300",
  locked: "bg-amber-100 text-amber-800 border-amber-300",
  reserved: "bg-blue-100 text-blue-800 border-blue-300",
  awaiting_payment: "bg-orange-100 text-orange-800 border-orange-300",
  confirmed: "bg-violet-100 text-violet-800 border-violet-300",
  admin_held: "bg-slate-100 text-slate-800 border-slate-300",
  blocked: "bg-red-100 text-red-800 border-red-300",
  unavailable: "bg-neutral-200 text-neutral-600 border-neutral-300",
};

export const FEATURE_TAG_LABELS: Record<string, string> = {
  near_entrance: "Near entrance",
  near_seating: "Near seating",
  near_electrical: "Near electrical",
  food_area: "Food area",
  clothing_zone: "Clothing zone",
  coffee_area: "Coffee area",
  high_traffic: "High traffic",
  corner: "Corner",
};

export const MAP_FEATURE_LABELS: Record<string, string> = {
  entrance: "Entrance",
  exit: "Exit",
  loading_bay: "Loading Bay",
  main_stage: "Main Stage",
  food_section: "Food Section",
  clothing_section: "Clothing Section",
  coffee_area: "Coffee Area",
  electrical_point: "Electrical Point",
  restroom: "Restroom",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  not_requested: "Not Requested",
  payment_required: "Payment Required",
  pending_payment: "Pending Payment",
  receipt_uploaded: "Receipt Uploaded",
  pending_verification: "Pending Verification",
  paid: "Paid",
  failed: "Failed",
  expired: "Expired",
  refunded: "Refunded",
  partially_refunded: "Partially Refunded",
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  not_requested: "bg-neutral-100 text-neutral-700 border-neutral-300",
  payment_required: "bg-amber-100 text-amber-800 border-amber-300",
  pending_payment: "bg-blue-100 text-blue-800 border-blue-300",
  receipt_uploaded: "bg-blue-100 text-blue-800 border-blue-300",
  pending_verification: "bg-violet-100 text-violet-800 border-violet-300",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  failed: "bg-red-100 text-red-800 border-red-300",
  expired: "bg-neutral-200 text-neutral-600 border-neutral-300",
  refunded: "bg-orange-100 text-orange-800 border-orange-300",
  partially_refunded: "bg-orange-100 text-orange-800 border-orange-300",
};

export const VAT_RATE = 0.05;

export const UAE_PHONE_REGEX = /^(?:\+971|00971|971|0)?(?:2|3|4|6|7|9|50|51|52|54|55|56|58)\d{6,7}$/;

export const NEXT_STEP_COPY: Record<string, { title: string; description: string }> = {
  profile_incomplete: {
    title: "Complete your profile",
    description: "Fill in your business details so Dar Al Hay can review your application.",
  },
  pending_review: {
    title: "Awaiting approval",
    description: "Saeed or Omar is reviewing your business. We'll notify you once it's decided.",
  },
  rejected: {
    title: "Application not approved",
    description: "See the reason below. You can update your profile and ask for reconsideration.",
  },
  suspended: {
    title: "Account suspended",
    description: "Contact Dar Al Hay for details on your account status.",
  },
  blacklisted: {
    title: "Account restricted",
    description: "This account cannot register for events. Contact Dar Al Hay for details.",
  },
};
