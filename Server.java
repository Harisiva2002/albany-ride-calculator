import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class Server {
    public static void main(String[] args) throws IOException {
        int port = 8080;
        // Bind to 0.0.0.0 so the server is exposed to the local network (meaning a phone on Wi-Fi can reach it)
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/", new HttpHandler() {
            @Override
            public void handle(HttpExchange exchange) throws IOException {
                String path = exchange.getRequestURI().getPath();
                if (path.equals("/")) {
                    path = "/index.html";
                }
                Path filePath = Paths.get("." + path);
                
                exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
                
                if (!Files.exists(filePath) || Files.isDirectory(filePath)) {
                    String response = "404 Not Found";
                    exchange.sendResponseHeaders(404, response.length());
                    OutputStream os = exchange.getResponseBody();
                    os.write(response.getBytes());
                    os.close();
                    return;
                }
                
                String contentType = "text/plain";
                if (path.endsWith(".html")) contentType = "text/html";
                else if (path.endsWith(".css")) contentType = "text/css";
                else if (path.endsWith(".js")) contentType = "application/javascript";
                else if (path.endsWith(".png")) contentType = "image/png";
                else if (path.endsWith(".webp")) contentType = "image/webp";
                
                exchange.getResponseHeaders().set("Content-Type", contentType);
                exchange.sendResponseHeaders(200, Files.size(filePath));
                OutputStream os = exchange.getResponseBody();
                Files.copy(filePath, os);
                os.close();
            }
        });
        server.setExecutor(null); 
        server.start();
        System.out.println("------------------------------------------------------------------");
        System.out.println("✅ SERVER RUNNING");
        System.out.println("🌍 To test on your laptop:   http://localhost:" + port);
        System.out.println("📱 To test on your PHONE:    http://192.168.29.219:" + port);
        System.out.println("------------------------------------------------------------------");
    }
}
