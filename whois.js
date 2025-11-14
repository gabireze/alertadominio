import net from "node:net";

export async function checkDomainCOM(domain) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = "";

    socket.setTimeout(3000);

    socket.connect(43, "whois.verisign-grs.com", () => {
      socket.write(domain + "\r\n");
    });

    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });

    socket.on("end", () => {
      resolve(parseWhoisCOM(domain, data));
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout WHOIS .com"));
    });

    socket.on("error", (err) => {
      reject(err);
    });
  });
}

function parseWhoisCOM(domain, raw) {
  if (raw.includes("No match for")) {
    return {
      domain,
      type: "com",
      status: 0,
      statusText: "Disponível",
      raw,
    };
  }

  return {
    domain,
    type: "com",
    status: 2,
    statusText: "Registrado",
    raw,
  };
}
