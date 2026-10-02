import 'dart:io';

const _ignoredDirectories = {
  '.dart_tool',
  '.git',
  '.gradle',
  '.idea',
  'build',
  'ephemeral',
  'Pods',
};

const _forbiddenExtensions = {'.env', '.jks', '.keystore', '.p12', '.pfx'};

final _credentialPatterns = <(String, RegExp)>[
  ('private key', RegExp(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
  ('AWS access key', RegExp(r'AKIA[0-9A-Z]{16}')),
  ('GitHub token', RegExp(r'gh[oprsu]_[A-Za-z0-9_]{30,}')),
  ('Google API key', RegExp(r'AIza[0-9A-Za-z_-]{35}')),
];

void main() {
  final findings = <String>[];
  for (final entity in Directory.current.listSync(recursive: true)) {
    if (entity is! File) continue;
    final segments = entity.path.split(Platform.pathSeparator);
    if (segments.any(_ignoredDirectories.contains)) continue;

    final lowerPath = entity.path.toLowerCase();
    if (_forbiddenExtensions.any(lowerPath.endsWith)) {
      findings.add('${entity.path}: forbidden credential file type');
      continue;
    }
    if (_isBinary(lowerPath)) continue;

    String content;
    try {
      content = entity.readAsStringSync();
    } on FileSystemException {
      continue;
    }
    for (final (label, pattern) in _credentialPatterns) {
      if (pattern.hasMatch(content)) findings.add('${entity.path}: $label');
    }
  }

  if (findings.isNotEmpty) {
    stderr.writeln('Potential committed credentials detected:');
    for (final finding in findings) {
      stderr.writeln('  $finding');
    }
    exitCode = 1;
  } else {
    stdout.writeln('No credential material detected.');
  }
}

bool _isBinary(String path) => const {
      '.gif',
      '.ico',
      '.jpeg',
      '.jpg',
      '.pdf',
      '.png',
      '.ttf',
      '.webp',
      '.zip',
    }.any(path.endsWith);
