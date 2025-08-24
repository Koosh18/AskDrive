// Background script for AskDrive extension
// Handles OAuth redirects and basic extension functionality

chrome.runtime.onInstalled.addListener(() => {
  console.log('AskDrive extension installed');
});

// Handle any OAuth redirects if needed
chrome.identity.onSignInChanged.addListener((account, signedIn) => {
  console.log('Sign in state changed:', signedIn ? 'signed in' : 'signed out');
});
