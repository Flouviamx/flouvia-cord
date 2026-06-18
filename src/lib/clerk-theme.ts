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
