import javax.tools.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class JavaRunner {
    
    private static final JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    private static final long TIME_LIMIT_MS = 5000;
    
    public static void main(String[] args) {
        System.err.println("JavaRunner service started and ready...");
        
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                System.err.println("Received line length: " + line.length());
                
                try {
                    int delimIndex = line.indexOf("|||");
                    if (delimIndex == -1) {
                        System.err.println("ERROR: No delimiter found");
                        sendError("Invalid format: missing delimiter");
                        continue;
                    }
                    
                    String codeBase64 = line.substring(0, delimIndex);
                    String inputBase64 = line.substring(delimIndex + 3);
                    
                    System.err.println("Code base64 length: " + codeBase64.length());
                    System.err.println("Input base64 length: " + inputBase64.length());
                    
                    // Decode from Base64
                    String code;
                    String input;
                    
                    try {
                        byte[] codeBytes = Base64.getDecoder().decode(codeBase64);
                        code = new String(codeBytes, StandardCharsets.UTF_8);
                        
                        byte[] inputBytes = Base64.getDecoder().decode(inputBase64);
                        input = new String(inputBytes, StandardCharsets.UTF_8);
                    } catch (IllegalArgumentException e) {
                        System.err.println("ERROR: Base64 decode failed: " + e.getMessage());
                        sendError("Invalid Base64 encoding");
                        continue;
                    }
                    
                    System.err.println("Decoded code length: " + code.length());
                    System.err.println("Decoded code preview: " + code.substring(0, Math.min(100, code.length())));
                    System.err.println("Processing submission...");
                    
                    String result = processSubmission(code, input);
                    System.out.println(result);
                    System.out.flush();
                    
                    System.err.println("Response sent");
                    
                } catch (Exception e) {
                    System.err.println("ERROR: " + e.getMessage());
                    e.printStackTrace(System.err);
                    sendError(e.getMessage());
                }
            }
        } catch (IOException e) {
            System.err.println("JavaRunner error: " + e.getMessage());
            e.printStackTrace(System.err);
        }
    }
    
    private static void sendError(String message) {
        String error = String.format("{\"success\":false,\"error\":\"%s\"}", escapeJson(message));
        System.out.println(error);
        System.out.flush();
    }
    
    private static String processSubmission(String code, String userInput) {
        try {
            String className = extractClassName(code);
            System.err.println("Main class determined: " + className);
            
            // Ensure at least one class is public
            if (!code.contains("public class")) {
                code = code.replaceFirst("class\\s+" + className, "public class " + className);
            }
            
            long compileStart = System.currentTimeMillis();
            InMemoryCompiler memCompiler = new InMemoryCompiler();
            boolean compiled = memCompiler.compile(className, code);
            long compileTime = System.currentTimeMillis() - compileStart;
            
            if (!compiled) {
                return String.format("{\"success\":false,\"verdict\":\"COMPILATION_ERROR\",\"errors\":\"%s\",\"compileTime\":%d}",
                    escapeJson(memCompiler.getDiagnostics()), compileTime);
            }
            
            long execStart = System.currentTimeMillis();
            ExecutionResult result = executeWithLimits(memCompiler, className, userInput);
            long execTime = System.currentTimeMillis() - execStart;
            
            return String.format("{\"success\":%s,\"verdict\":\"%s\",\"output\":\"%s\",\"errors\":\"%s\",\"executionTime\":%d,\"compileTime\":%d}",
                result.success, result.verdict, escapeJson(result.output), 
                escapeJson(result.errors), execTime, compileTime);
                
        } catch (Exception e) {
            return String.format("{\"success\":false,\"error\":\"%s\"}", escapeJson(e.getMessage()));
        }
    }
    
    private static String extractClassName(String code) {
        // Strategy: locate "public static void main" in the source, then find the
        // nearest class declaration that appears BEFORE that position.
        // This is robust to any nesting depth — no brace-counting needed.
        java.util.regex.Pattern mainPattern = java.util.regex.Pattern.compile(
            "public\\s+static\\s+void\\s+main");
        java.util.regex.Matcher mainMatcher = mainPattern.matcher(code);

        if (mainMatcher.find()) {
            int mainPos = mainMatcher.start();
            // Scan everything before the main method for class declarations
            java.util.regex.Pattern classPattern = java.util.regex.Pattern.compile(
                "class\\s+([A-Za-z_$][A-Za-z0-9_$]*)");
            java.util.regex.Matcher classMatcher = classPattern.matcher(code.substring(0, mainPos));
            String lastClassBeforeMain = null;
            while (classMatcher.find()) {
                lastClassBeforeMain = classMatcher.group(1);
            }
            if (lastClassBeforeMain != null) {
                System.err.println("Found class containing main: " + lastClassBeforeMain);
                return lastClassBeforeMain;
            }
        }

        // Fallback 1: any public class
        String publicMatch = extractPattern(code, "public\\s+class\\s+([A-Za-z_$][A-Za-z0-9_$]*)");
        if (publicMatch != null) {
            System.err.println("Found public class: " + publicMatch);
            return publicMatch;
        }

        // Fallback 2: any class at all
        String anyMatch = extractPattern(code, "class\\s+([A-Za-z_$][A-Za-z0-9_$]*)");
        System.err.println("Found class: " + (anyMatch != null ? anyMatch : "Main"));
        return anyMatch != null ? anyMatch : "Main";
    }
    
    private static String extractPattern(String text, String pattern) {
        java.util.regex.Pattern p = java.util.regex.Pattern.compile(pattern, java.util.regex.Pattern.DOTALL);
        java.util.regex.Matcher m = p.matcher(text);
        return m.find() ? m.group(1) : null;
    }
    
    private static ExecutionResult executeWithLimits(InMemoryCompiler compiler, String className, String input) {
        ExecutionResult result = new ExecutionResult();
        
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        ByteArrayOutputStream errorStream = new ByteArrayOutputStream();
        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;
        InputStream originalIn = System.in;
        
        Thread executionThread = new Thread(() -> {
            try {
                System.setOut(new PrintStream(outputStream));
                System.setErr(new PrintStream(errorStream));
                System.setIn(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)));
                
                Class<?> cls = compiler.loadClass(className);
                java.lang.reflect.Method mainMethod = cls.getDeclaredMethod("main", String[].class);
                mainMethod.setAccessible(true);
                mainMethod.invoke(null, (Object) new String[0]);
                
                result.success = true;
                result.verdict = "ACCEPTED";
                result.output = outputStream.toString(StandardCharsets.UTF_8);
                
            } catch (java.lang.reflect.InvocationTargetException e) {
                result.success = false;
                result.verdict = "RUNTIME_ERROR";
                Throwable cause = e.getCause();
                if (cause != null) {
                    StringWriter sw = new StringWriter();
                    PrintWriter pw = new PrintWriter(sw);
                    cause.printStackTrace(pw);
                    result.errors = sw.toString();
                } else {
                    result.errors = e.toString();
                }
            } catch (Exception e) {
                result.success = false;
                result.verdict = "RUNTIME_ERROR";
                result.errors = e.toString();
            } finally {
                System.setOut(originalOut);
                System.setErr(originalErr);
                System.setIn(originalIn);
            }
        });
        
        executionThread.start();
        
        try {
            executionThread.join(TIME_LIMIT_MS);
            
            if (executionThread.isAlive()) {
                executionThread.interrupt();
                executionThread.join(100);
                result.success = false;
                result.verdict = "TIME_LIMIT_EXCEEDED";
                result.errors = "Execution time exceeded " + TIME_LIMIT_MS + "ms";
            }
            
            if (outputStream.size() > 1048576) {
                result.verdict = "OUTPUT_LIMIT_EXCEEDED";
                result.success = false;
            }
            
        } catch (InterruptedException e) {
            result.success = false;
            result.verdict = "RUNTIME_ERROR";
            result.errors = "Execution interrupted";
        }
        
        return result;
    }
    
    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
    
    static class ExecutionResult {
        boolean success = false;
        String verdict = "";
        String output = "";
        String errors = "";
    }
    
    static class InMemoryCompiler {
        private final Map<String, ByteArrayOutputStream> classBytes = new HashMap<>();
        private String diagnostics = "";
        
        public boolean compile(String mainClassName, String code) {
            // Extract all class names from the code
            List<String> classNames = extractAllClassNames(code);
            
            if (classNames.isEmpty()) {
                diagnostics = "No class found in the code";
                return false;
            }
            
            System.err.println("Found classes: " + classNames);
            
            // Create a single source file with all classes
            JavaFileObject sourceFile = new JavaSourceFromString(mainClassName, code);
            
            DiagnosticCollector<JavaFileObject> diagnosticsCollector = new DiagnosticCollector<>();
            StandardJavaFileManager standardFileManager = compiler.getStandardFileManager(diagnosticsCollector, null, null);
            
            InMemoryFileManager fileManager = new InMemoryFileManager(standardFileManager, classBytes);
            
            JavaCompiler.CompilationTask task = compiler.getTask(
                null,
                fileManager,
                diagnosticsCollector,
                Arrays.asList("-g:none"),
                null,
                Collections.singletonList(sourceFile)
            );
            
            boolean success = task.call();
            
            if (!success) {
                StringBuilder sb = new StringBuilder();
                for (Diagnostic<?> diagnostic : diagnosticsCollector.getDiagnostics()) {
                    sb.append(diagnostic.getKind()).append(": ")
                      .append(diagnostic.getMessage(null)).append("\\n");
                }
                diagnostics = sb.toString();
            } else {
                System.err.println("Compiled classes: " + classBytes.keySet());
            }
            
            return success;
        }
        
        private List<String> extractAllClassNames(String code) {
            List<String> classNames = new ArrayList<>();
            java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("class\\s+([A-Za-z_$][A-Za-z0-9_$]*)");
            java.util.regex.Matcher matcher = pattern.matcher(code);
            
            while (matcher.find()) {
                classNames.add(matcher.group(1));
            }
            
            return classNames;
        }
        
        public Class<?> loadClass(String className) throws ClassNotFoundException {
            InMemoryClassLoader loader = new InMemoryClassLoader(classBytes);
            return loader.loadClass(className);
        }
        
        public String getDiagnostics() {
            return diagnostics;
        }
    }
    
    static class JavaSourceFromString extends SimpleJavaFileObject {
        private final String code;
        
        public JavaSourceFromString(String name, String code) {
            super(URI.create("string:///" + name.replace('.', '/') + Kind.SOURCE.extension), Kind.SOURCE);
            this.code = code;
        }
        
        @Override
        public CharSequence getCharContent(boolean ignoreEncodingErrors) {
            return code;
        }
    }
    
    static class InMemoryFileManager extends ForwardingJavaFileManager<StandardJavaFileManager> {
        private final Map<String, ByteArrayOutputStream> classBytes;
        
        public InMemoryFileManager(StandardJavaFileManager fileManager, Map<String, ByteArrayOutputStream> classBytes) {
            super(fileManager);
            this.classBytes = classBytes;
        }
        
        @Override
        public JavaFileObject getJavaFileForOutput(Location location, String className, JavaFileObject.Kind kind, FileObject sibling) {
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            classBytes.put(className, outputStream);
            return new SimpleJavaFileObject(URI.create("mem:///" + className.replace('.', '/') + kind.extension), kind) {
                @Override
                public OutputStream openOutputStream() {
                    return outputStream;
                }
            };
        }
    }
    
    static class InMemoryClassLoader extends ClassLoader {
        private final Map<String, ByteArrayOutputStream> classBytes;
        
        public InMemoryClassLoader(Map<String, ByteArrayOutputStream> classBytes) {
            super(ClassLoader.getSystemClassLoader());
            this.classBytes = classBytes;
        }
        
        @Override
        protected Class<?> findClass(String name) throws ClassNotFoundException {
            System.err.println("Loading class: " + name);
            ByteArrayOutputStream byteCode = classBytes.get(name);
            if (byteCode == null) {
                System.err.println("Class not found in compiled bytes: " + name);
                System.err.println("Available classes: " + classBytes.keySet());
                throw new ClassNotFoundException(name);
            }
            byte[] bytes = byteCode.toByteArray();
            System.err.println("Loaded " + bytes.length + " bytes for " + name);
            return defineClass(name, bytes, 0, bytes.length);
        }
        
        @Override
        public Class<?> loadClass(String name) throws ClassNotFoundException {
            // First check if we have this class in our compiled classes
            if (classBytes.containsKey(name)) {
                return findClass(name);
            }
            // Otherwise delegate to parent (for system classes like Object, String, etc.)
            return super.loadClass(name);
        }
    }
}