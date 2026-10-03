const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const golfApiBase = "https://api.golfcourseapi.com";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function proxyGolfApi(request, response, requestUrl) {
  const apiKey = process.env.GOLF_COURSE_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, {
      error:
        "Golf Course API is not configured. Set GOLF_COURSE_API_KEY on the server.",
    });
    return;
  }

  const localPath = requestUrl.pathname.replace(/^\/api\/golf/, "");
  let pathName;
  if (localPath === "/courses") {
    pathName = "/v1/search";
  } else if (localPath.startsWith("/courses/")) {
    const courseId = localPath.slice("/courses/".length).toLowerCase();
    if (!/^[0-9abcdefghjkmnpqrstvwxyz]{8}$/.test(courseId)) {
      sendJson(response, 404, {
        error: "The requested course id is not valid.",
      });
      return;
    }
    pathName = `/v1/courses/${courseId}`;
  } else {
    sendJson(response, 404, { error: "Unsupported Golf Course API route." });
    return;
  }
  const upstreamUrl = new URL(`${golfApiBase}${pathName}`);
  if (localPath === "/courses") {
    const searchTerms = ["name", "city", "country"]
      .map((key) => requestUrl.searchParams.get(key))
      .filter(Boolean)
      .join(" ");
    if (!searchTerms) {
      sendJson(response, 400, {
        error: "Provide a course name, city, or country to search.",
      });
      return;
    }
    upstreamUrl.searchParams.set("search_query", searchTerms);
    upstreamUrl.searchParams.set("fuzzy_match", "true");
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    const body = await upstream.text();
    response.writeHead(upstream.status, {
      "Content-Type":
        upstream.headers.get("content-type") || "application/json",
    });
    response.end(body);
  } catch {
    sendJson(response, 502, {
      error: "The Golf Course API could not be reached.",
    });
  }
}

http
  .createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1:4173");
    if (requestUrl.pathname.startsWith("/api/golf/")) {
      await proxyGolfApi(request, response, requestUrl);
      return;
    }

    const requestPath =
      requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const filePath = path.join(root, decodeURIComponent(requestPath));
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500);
        response.end(error.code === "ENOENT" ? "Not found" : "Server error");
        return;
      }
      response.writeHead(200, {
        "Content-Type":
          contentTypes[path.extname(filePath)] || "text/plain; charset=utf-8",
      });
      response.end(content);
    });
  })
  .listen(4173, "127.0.0.1", () => {
    console.log("Fairway Live preview running at http://127.0.0.1:4173");
  });
