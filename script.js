// awal navbar 1
const navbar = document.getElementById('navbar');
const halamanUtama = document.querySelector('.halaman_utama');

window.addEventListener('scroll', () => {
    const rect = halamanUtama.getBoundingClientRect();

    // Aktifkan sticky hanya saat masih scroll di dalam .halaman_utama
    if (rect.top <= 0 && rect.bottom > 100) {
        navbar.classList.add('fixed');
    } else {
        navbar.classList.remove('fixed');
    }
});
// akhir navbar 1

// scroll on top
const scrollToTopBtn = document.getElementById("scrollToTopBtn");
const footer = document.querySelector("footer");

function toggleScrollToTopButton() {
    if (!footer || !scrollToTopBtn) {
        return;
    }

    const footerTop = footer.offsetTop;
    const scrollPosition = window.scrollY + window.innerHeight;

    if (scrollPosition >= footerTop) {
        scrollToTopBtn.style.display = "block";
        scrollToTopBtn.style.opacity = "1";
        scrollToTopBtn.style.visibility = "visible";
    } else {
        scrollToTopBtn.style.opacity = "0";
        scrollToTopBtn.style.visibility = "hidden";
        setTimeout(() => {
            if (scrollToTopBtn.style.opacity === "0") {
                scrollToTopBtn.style.display = "none";
            }
        }, 500);
    }
}

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

window.addEventListener("scroll", toggleScrollToTopButton);

if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener("click", scrollToTop);
}

document.addEventListener("DOMContentLoaded", () => {
    toggleScrollToTopButton();
});
// akhir scroll in top

// seacrh

// akhir seacrh