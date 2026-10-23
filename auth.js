async function apiRequest(url, data) {
    const response = await fetch(url, {
        method: data ? "POST" : "GET",
        headers: data ? {
            "Content-Type": "application/json"
        } : {},
        credentials: "same-origin",
        body: data ? JSON.stringify(data) : undefined
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Произошла ошибка.");
    }

    return result;
}

async function getCurrentUser() {
    const result = await apiRequest("/api/me");
    return result.user;
}

async function requireAuth() {
    const user = await getCurrentUser();

    if (!user) {
        window.location.href = "/auth.html";
        return null;
    }

    return user;
}

async function logoutUser() {
    try {
        await apiRequest("/api/logout", {});
        window.location.href = "/";
    } catch (error) {
        alert(error.message);
    }
}

function showMessage(element, message, success = false) {
    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#9edb34" : "#ff6b6b";
}