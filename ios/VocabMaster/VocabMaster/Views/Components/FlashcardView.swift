import SwiftUI

struct FlashcardView: View {
    let entry: WordEntry
    @Binding var isRevealed: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Front: Word
            VStack(spacing: 8) {
                Text(entry.word)
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.purple)

                if let phonetic = entry.phonetic, !phonetic.isEmpty {
                    Text(phonetic)
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .italic()
                }
            }

            // Back: Answer (revealed)
            if isRevealed {
                VStack(spacing: 10) {
                    Divider()
                        .background(Color.purple.opacity(0.3))
                        .padding(.vertical, 12)

                    if let translation = entry.translation {
                        Text(translation)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                    }

                    if let first = entry.meanings.first,
                       let def = first.definitions.first {
                        Text("[\(first.partOfSpeech)] \(def.definition)")
                            .font(.caption)
                            .foregroundColor(.gray)
                            .lineLimit(3)
                            .multilineTextAlignment(.center)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            if !isRevealed {
                Text("点击查看释义")
                    .font(.caption)
                    .foregroundColor(.gray.opacity(0.5))
                    .padding(.top, 20)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, minHeight: 200)
        .background(Color(hex: "1e1e3c").opacity(0.7))
        .cornerRadius(20)
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.purple.opacity(isRevealed ? 0.4 : 0.15), lineWidth: 1)
        )
        .onTapGesture {
            withAnimation(.spring(response: 0.3)) {
                isRevealed = true
            }
        }
    }
}
