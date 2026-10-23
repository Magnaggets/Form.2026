const canvas = document.createElement("canvas"); canvas.id = "stars"; document.body.prepend(canvas);
const ctx = canvas.getContext("2d");
let stars = [];
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight;
stars = [];

for (let i = 0; i < 65; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 8 + 6,
        speed: Math.random() * 0.7 + 0.3,
        opacity: Math.random() * 0.6 + 0.2
    });
}
}
function drawStar(x, y, size, opacity) { ctx.globalAlpha = opacity; ctx.fillStyle = "#d6ff3f";
ctx.beginPath();

for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? size : size * 0.4;

    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;

    if (i === 0) {
        ctx.moveTo(px, py);
    } else {
        ctx.lineTo(px, py);
    }
}

ctx.closePath();
ctx.fill();
}
function animate() { ctx.clearRect(0, 0, canvas.width, canvas.height);
for (const star of stars) {
    drawStar(star.x, star.y, star.size, star.opacity);

    star.y += star.speed;
    star.x += Math.sin(star.y / 80) * 0.15;

    if (star.y > canvas.height + 10) {
        star.y = -10;
        star.x = Math.random() * canvas.width;
    }
}

ctx.globalAlpha = 1;
requestAnimationFrame(animate);
}
resizeCanvas(); window.addEventListener("resize", resizeCanvas); animate();


async function updateAuthButtons() {
    const accountLink = document.getElementById("accountLink");

    if (!accountLink) return;

    try {
        const response = await fetch("/api/me");
        if (!response.ok) return;

        const data = await response.json();

        if (data.user) {
            accountLink.href = "/cabinet.html";
            accountLink.textContent = "Личный кабинет";
        } else {
            accountLink.href = "/auth.html";
            accountLink.textContent = "Войти";
        }
    } catch (error) {
        console.error("Ошибка проверки аккаунта:", error);
    }
}

updateAuthButtons();