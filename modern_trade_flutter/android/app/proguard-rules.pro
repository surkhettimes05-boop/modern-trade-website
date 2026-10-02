# Flutter plugins are registered through generated Android embedding code. R8
# rules bundled with Flutter and each plugin remain authoritative; keep this
# file for application-specific rules discovered by release tests.

# Preserve source/line metadata so securely retained native symbols remain
# useful when decoding production crash reports.
-keepattributes SourceFile,LineNumberTable
