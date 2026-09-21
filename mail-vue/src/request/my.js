import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

export function oauthBindList() {
    return http.get('/my/oauth/list')
}

export function oauthUnbind(oauthId) {
    return http.delete(`/my/oauth/${oauthId}`)
}

export function oauthLinkCurrent(oauthUserId) {
    return http.put('/my/oauth/link', { oauthUserId })
}

