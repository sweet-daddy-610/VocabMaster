import SwiftUI
import AVFoundation

struct WordResultView: View {
    let entry: WordEntry
    let translation: String?
    let inputType: InputType
    let source: String?
    let isSaved: Bool

    @State private var audioPlayer: AVPlayer?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Word Header
            wordHeader

            // Translation Card
            if let translation = translation {
                translationCard(translation)
            }

            // Definitions
            if !entry.meanings.isEmpty {
                definitionsSection
            } else {
                noDefinitionsView
            }
        }
    }

    // MARK: - Word Header

    private var wordHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.word)
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)

                    if let phonetic = entry.phonetic {
                        Text(phonetic)
                            .font(.subheadline)
                            .foregroundColor(.gray)
                            .italic()
                    }
                }

                Spacer()

                // Sound button
                Button { playAudio() } label: {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.title3)
                        .foregroundColor(.purple)
                        .padding(10)
                        .background(Color.purple.opacity(0.12))
                        .cornerRadius(10)
                }
            }

            // Badges
            HStack(spacing: 6) {
                if inputType == .phrase {
                    badge("短语", color: .orange)
                } else if inputType == .chinese {
                    badge("中文查询", color: .red)
                }

                if source == "wiktionary" {
                    badge("Wiktionary", color: .cyan)
                } else if source == "translation-only" {
                    badge("仅翻译", color: .indigo)
                }

                if isSaved {
                    badge("已收录", color: .green)
                }
            }
        }
        .padding(16)
        .background(Color(hex: "1e1e3c").opacity(0.6))
        .cornerRadius(16)
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .foregroundColor(color)
            .cornerRadius(6)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(color.opacity(0.25)))
    }

    // MARK: - Translation Card

    private func translationCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(inputType == .chinese ? "英文释义" : "中文释义")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.gray)

            Text(text)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.purple.opacity(0.08))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.purple.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Definitions

    private var definitionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("英文释义")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.gray)

            ForEach(entry.meanings.indices, id: \.self) { i in
                let meaning = entry.meanings[i]
                VStack(alignment: .leading, spacing: 8) {
                    Text(meaning.partOfSpeech)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.purple)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.purple.opacity(0.1))
                        .cornerRadius(4)

                    ForEach(meaning.definitions.indices, id: \.self) { j in
                        let def = meaning.definitions[j]
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .top, spacing: 8) {
                                Text("\(j + 1).")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                    .frame(width: 18, alignment: .trailing)

                                Text(def.definition)
                                    .font(.subheadline)
                                    .foregroundColor(.white.opacity(0.9))
                            }

                            if let example = def.example {
                                Text(""\(example)"")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                    .italic()
                                    .padding(.leading, 26)
                            }
                        }
                    }
                }
                .padding(12)
                .background(Color(hex: "1e1e3c").opacity(0.4))
                .cornerRadius(10)
            }
        }
    }

    private var noDefinitionsView: some View {
        VStack(spacing: 8) {
            Text("暂无详细英文释义")
                .font(.subheadline)
                .foregroundColor(.gray)
            Text("已提供翻译结果，可在词汇本中学习")
                .font(.caption)
                .foregroundColor(.gray.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(Color(hex: "1e1e3c").opacity(0.3))
        .cornerRadius(12)
    }

    // MARK: - Audio

    private func playAudio() {
        // Priority 1: API audio
        if let urlStr = entry.audioUrl, let url = URL(string: urlStr) {
            audioPlayer = AVPlayer(url: url)
            audioPlayer?.play()
            return
        }

        // Priority 2: TTS
        let utterance = AVSpeechUtterance(string: entry.word)
        utterance.voice = AVSpeechSynthesisVoice(language:
            inputType == .chinese ? "zh-CN" : "en-US")
        utterance.rate = 0.45
        AVSpeechSynthesizer().speak(utterance)
    }
}
