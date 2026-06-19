import { dark } from '@clerk/themes';

export const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#ffffff',
    colorBackground: '#09090b',
    colorInputBackground: '#18181b',
    colorInputText: '#ffffff',
    colorText: '#ededed',
    colorTextSecondary: '#a1a1aa',
    colorDanger: '#ef4444',
    colorSuccess: '#22c55e',
    colorWarning: '#eab308',
    borderRadius: '0.5rem',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  elements: {
    card: {
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      border: '1px solid #27272a',
    },
    formButtonPrimary: {
      backgroundColor: '#ffffff',
      color: '#09090b',
      textTransform: 'none',
      fontWeight: '600',
      transition: 'all 0.2s ease',
      border: '1px solid transparent',
      '&:hover': {
        backgroundColor: '#e4e4e7',
      },
    },
    formButtonReset: {
      color: '#ffffff',
      '&:hover': {
        backgroundColor: '#27272a',
      },
    },
    socialButtonsBlockButton: {
      border: '1px solid #27272a',
      backgroundColor: '#09090b',
      color: '#ffffff',
      transition: 'all 0.2s ease',
      '&:hover': {
        backgroundColor: '#18181b',
      },
    },
    socialButtonsBlockButtonText: {
      fontWeight: '500',
    },
    dividerLine: {
      backgroundColor: '#27272a',
    },
    dividerText: {
      color: '#a1a1aa',
    },
    formFieldLabel: {
      color: '#e4e4e7',
      fontWeight: '500',
    },
    formFieldInput: {
      border: '1px solid #27272a',
      transition: 'all 0.2s ease',
      backgroundColor: '#18181b',
      color: '#ffffff',
      '&:focus': {
        border: '1px solid #52525b',
        boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.1)',
      },
    },
    footerActionLink: {
      color: '#ffffff',
      fontWeight: '600',
      '&:hover': {
        color: '#e4e4e7',
      },
    },
    identityPreview: {
      border: '1px solid #27272a',
      backgroundColor: '#18181b',
    },
    navbar: {
      borderRight: '1px solid #27272a',
    },
    navbarButton: {
      color: '#a1a1aa',
      '&:hover': {
        color: '#ffffff',
        backgroundColor: '#18181b',
      },
    },
    scrollBox: {
      '&::-webkit-scrollbar': {
        width: '8px',
      },
      '&::-webkit-scrollbar-track': {
        backgroundColor: 'transparent',
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: '#27272a',
        borderRadius: '4px',
      },
      '&::-webkit-scrollbar-thumb:hover': {
        backgroundColor: '#3f3f46',
      },
    },
    organizationSwitcherTrigger: {
      color: '#ffffff',
      border: '1px solid #27272a',
      backgroundColor: '#09090b',
      padding: '0.375rem 0.75rem',
      borderRadius: '0.5rem',
      transition: 'all 0.2s ease',
      '&:hover': {
        backgroundColor: '#18181b',
      },
    },
  },
};

export const clerkAppAppearance = {
  variables: {
    colorPrimary: '#0a192f',
    colorBackground: '#ffffff',
    colorInputBackground: '#fafbfc',
    colorInputText: '#0f1729',
    colorText: '#0f1729',
    colorTextSecondary: '#5b6472',
    colorDanger: '#ef4444',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    borderRadius: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  elements: {
    card: {
      boxShadow: 'none',
      border: 'none',
      backgroundColor: 'transparent',
      width: '100%',
      maxWidth: '100%',
      padding: '0',
    },
    rootBox: {
      width: '100%',
    },
    navbar: {
      borderRight: '1px solid rgba(10, 25, 47, 0.08)',
    },
    navbarButton: {
      color: '#5b6472',
      '&:hover': {
        color: '#0f1729',
        backgroundColor: '#fafbfc',
      },
    },
    profileSectionTitle: {
      color: '#0f1729',
      fontSize: '1.25rem',
      fontWeight: '700',
    },
    profileSectionPrimaryButton: {
      backgroundColor: '#0a192f',
      color: '#ffffff',
      '&:hover': {
        backgroundColor: '#000000',
      },
    },
    formButtonPrimary: {
      backgroundColor: '#0a192f',
      color: '#ffffff',
      textTransform: 'none',
      fontWeight: '600',
      transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      border: '1px solid transparent',
      borderRadius: '10px',
      padding: '12px 26px',
      boxShadow: '0 8px 22px -10px rgba(10,25,47,0.5)',
      '&:hover': {
        backgroundColor: '#000000',
        transform: 'translateY(-2px)',
      },
    },
    formButtonReset: {
      color: '#5b6472',
      '&:hover': {
        backgroundColor: '#fafbfc',
        color: '#0f1729',
      },
    },
    formFieldLabel: {
      color: '#99a2af',
      fontWeight: '800',
      fontSize: '0.62rem',
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
    },
    formFieldInput: {
      border: '1px solid rgba(10, 25, 47, 0.08)',
      transition: 'all 0.25s ease',
      backgroundColor: '#fafbfc',
      color: '#0f1729',
      borderRadius: '9px',
      padding: '10px 12px',
      fontSize: '0.86rem',
      fontWeight: '500',
      '&:focus': {
        border: '1px solid #0a192f',
        outline: 'none',
        boxShadow: 'none',
      },
    },
    dividerLine: {
      backgroundColor: 'rgba(10, 25, 47, 0.08)',
    },
    dividerText: {
      color: '#5b6472',
    },
    scrollBox: {
      '&::-webkit-scrollbar': {
        width: '8px',
      },
      '&::-webkit-scrollbar-track': {
        backgroundColor: 'transparent',
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgba(10, 25, 47, 0.08)',
        borderRadius: '4px',
      },
      '&::-webkit-scrollbar-thumb:hover': {
        backgroundColor: 'rgba(10, 25, 47, 0.15)',
      },
    },
    badge: {
      backgroundColor: 'rgba(10, 25, 47, 0.06)',
      color: '#0f1729',
      fontWeight: '600',
      border: '1px solid rgba(10, 25, 47, 0.08)',
    },
    avatarImageActionsUpload: {
      color: '#0a192f',
      border: '1px solid rgba(10, 25, 47, 0.08)',
      '&:hover': {
        backgroundColor: '#fafbfc',
      },
    },
    avatarImageActionsRemove: {
      color: '#ef4444',
      border: '1px solid rgba(10, 25, 47, 0.08)',
      '&:hover': {
        backgroundColor: '#fafbfc',
      },
    },
    organizationSwitcherTrigger: {
      color: '#0f1729',
      border: '1px solid rgba(10, 25, 47, 0.08)',
      backgroundColor: '#fafbfc',
      padding: '0.375rem 0.75rem',
      borderRadius: '0.5rem',
      transition: 'all 0.2s ease',
      '&:hover': {
        backgroundColor: '#f1f3f5',
      },
    },
    userPreviewMainIdentifier: {
      color: '#0f1729',
      fontWeight: '600',
    },
    userPreviewSecondaryIdentifier: {
      color: '#5b6472',
    },
    profileSection: {
      borderBottom: '1px solid rgba(10, 25, 47, 0.08)',
    },
    tableHead: {
      borderBottom: '1px solid rgba(10, 25, 47, 0.08)',
    },
    tableRow: {
      borderBottom: '1px solid rgba(10, 25, 47, 0.08)',
    },
    paginationButton: {
      color: '#5b6472',
      '&:hover': {
        backgroundColor: '#fafbfc',
      },
    },
  },
};
