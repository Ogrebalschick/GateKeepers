export function useCurrentUser() {
    return {
        userId: localStorage.getItem('guard_user_id') || '',
        role: localStorage.getItem('guard_role') || '',
        username: localStorage.getItem('guard_username') || '',
        isAuthenticated: !!localStorage.getItem('guard_token'),
    };
}
