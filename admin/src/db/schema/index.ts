export {
  platformAdministratorRoles,
  platformAdministrators,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
} from "./administrators";
export { administratorOtpChallenges, administratorSessions } from "./auth";
export {
  businessProducts,
  businessSubscriptions,
  businesses,
  manualPayments,
  planFeatures,
  subscriptionEvents,
  subscriptionPlans,
} from "./businesses";
export {
  administratorStatusEnum,
  billingCycleEnum,
  manualPaymentMethodEnum,
  manualPaymentStatusEnum,
  planStatusEnum,
  platformBusinessStatusEnum,
  productStatusEnum,
  provisioningStatusEnum,
  subscriptionEventTypeEnum,
  subscriptionStatusEnum,
} from "./enums";
export {
  administrativeActivityLogs,
  businessProvisioning,
  invitations,
  platformAuditLogs,
  platformSettings,
} from "./onboarding";
export {
  productConfigurations,
  productIntegrationConfigs,
  saasProducts,
} from "./products";

import {
  platformAdministratorRoles,
  platformAdministrators,
  platformPermissions,
  platformRolePermissions,
  platformRoles,
} from "./administrators";
import { administratorOtpChallenges, administratorSessions } from "./auth";
import {
  businessProducts,
  businessSubscriptions,
  businesses,
  manualPayments,
  planFeatures,
  subscriptionEvents,
  subscriptionPlans,
} from "./businesses";
import {
  administrativeActivityLogs,
  businessProvisioning,
  invitations,
  platformAuditLogs,
  platformSettings,
} from "./onboarding";
import {
  productConfigurations,
  productIntegrationConfigs,
  saasProducts,
} from "./products";

export const schema = {
  platformPermissions,
  platformRoles,
  platformRolePermissions,
  platformAdministrators,
  platformAdministratorRoles,
  administratorOtpChallenges,
  administratorSessions,
  saasProducts,
  productConfigurations,
  productIntegrationConfigs,
  businesses,
  businessProducts,
  subscriptionPlans,
  planFeatures,
  businessSubscriptions,
  subscriptionEvents,
  manualPayments,
  invitations,
  businessProvisioning,
  platformSettings,
  platformAuditLogs,
  administrativeActivityLogs,
};
