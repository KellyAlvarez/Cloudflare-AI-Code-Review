fetch("http://localhost:8787/do/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        action: "addEntry",
        payload: { text: "Hello DO!" }
    })
})
    .then(r => r.json())
    .then(console.log)
    .catch(console.error);
