/* _constants.js — shared domain enums. One source so a validation list in one
   endpoint can't drift from another. Import-only (underscore prefix). */

export const PAYMENT_STATUSES = ['unpaid', 'deposit', 'paid'];
export const RES_STATUSES     = ['confirmed', 'cancelled', 'pending'];
export const RES_SOURCES      = ['online', 'phone', 'walkin', 'admin', 'form'];
export const SUBMISSION_STATUSES = ['new', 'accepted', 'declined'];

/* Manual-entry sources an admin may set when creating a booking by hand. */
export const MANUAL_SOURCES = ['phone', 'walkin', 'admin'];
