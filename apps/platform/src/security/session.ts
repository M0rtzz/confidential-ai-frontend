export type ConfidentialEndRole = 'CLIENT' | 'CENTER';

const TAB_TOKEN = 'Confidential-Tab-Token';
const TAB_ROLE = 'Confidential-Tab-End-Role';

export const activeEndRole = (): ConfidentialEndRole | null => {
  const value =
    sessionStorage.getItem(TAB_ROLE) || localStorage.getItem('Confidential-End-Role');
  return value === 'CLIENT' || value === 'CENTER' ? value : null;
};

export const activeUserToken = () => {
  const tabToken = sessionStorage.getItem(TAB_TOKEN);
  if (tabToken) return tabToken;
  const role = activeEndRole();
  return (
    (role && localStorage.getItem(`User-Token-${role}`)) ||
    localStorage.getItem('User-Token') ||
    ''
  );
};

export const saveActiveSession = (token: string, role: ConfidentialEndRole) => {
  sessionStorage.setItem(TAB_TOKEN, token);
  sessionStorage.setItem(TAB_ROLE, role);
  localStorage.setItem(`User-Token-${role}`, token);
  localStorage.setItem('User-Token', token);
  localStorage.setItem('Confidential-End-Role', role);
};

export const clearActiveSession = () => {
  const role = activeEndRole();
  sessionStorage.removeItem(TAB_TOKEN);
  sessionStorage.removeItem(TAB_ROLE);
  if (role) localStorage.removeItem(`User-Token-${role}`);
  localStorage.removeItem('User-Token');
  localStorage.removeItem('Confidential-End-Role');
};
