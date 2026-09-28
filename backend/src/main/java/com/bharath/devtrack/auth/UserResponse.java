package com.bharath.devtrack.auth;

public record UserResponse(Long id, String email) {
    public static UserResponse from(UserAccount user) {
        return new UserResponse(user.getId(), user.getEmail());
    }
}
