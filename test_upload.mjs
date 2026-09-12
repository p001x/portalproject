const formData = new FormData();
formData.append("title", "Test Title");
formData.append("author", "Unknown");
formData.append("pages", "0");
formData.append("description", "");

// Let's create a fake blob
const blob = new Blob(["fake pdf content"], { type: "application/pdf" });
formData.append("file", blob, "test.pdf");

// We need a token. We can't easily get one, but a 401 is success for this test.
fetch("http://localhost:8000/api/academy/books/upload", {
    method: "POST",
    body: formData
}).then(async r => {
    console.log(r.status);
    console.log(await r.text());
}).catch(console.error);
