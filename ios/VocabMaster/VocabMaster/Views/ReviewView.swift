import SwiftUI

struct ReviewView: View {
    @EnvironmentObject var store: VocabStore
    @State private var dueWords: [WordEntry] = []
    @State private var currentIndex = 0
    @State private var isRevealed = false
    @State private var showDoneState = false
    @State private var reviewCount = 0

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0f0f23").ignoresSafeArea()

                if showDoneState {
                    doneView
                } else if dueWords.isEmpty {
                    emptyView
                } else {
                    reviewContent
                }
            }
            .navigationTitle("复习")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { refreshDueWords() }
        }
    }

    // MARK: - Review Content

    private var reviewContent: some View {
        VStack(spacing: 20) {
            // Due count badge
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.red)
                    .frame(width: 8, height: 8)
                    .modifier(PulseModifier())
                Text("\(dueWords.count - currentIndex) 个词汇待复习")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.red)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(Color.red.opacity(0.1))
            .cornerRadius(20)

            Spacer()

            // Flashcard
            if currentIndex < dueWords.count {
                FlashcardView(
                    entry: dueWords[currentIndex],
                    isRevealed: $isRevealed
                )
                .padding(.horizontal)
            }

            Spacer()

            // Action buttons
            HStack(spacing: 16) {
                Button { handleReview(remembered: false) } label: {
                    Label("忘记了", systemImage: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.red.opacity(0.12))
                        .foregroundColor(.red)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.red.opacity(0.25), lineWidth: 1)
                        )
                }

                Button { handleReview(remembered: true) } label: {
                    Label("记住了", systemImage: "checkmark")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.green.opacity(0.12))
                        .foregroundColor(.green)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.green.opacity(0.25), lineWidth: 1)
                        )
                }
            }
            .padding(.horizontal)

            // Progress
            Text("\(currentIndex + 1) / \(dueWords.count)")
                .font(.caption)
                .foregroundColor(.gray)
                .padding(.bottom, 8)
        }
        .padding(.top)
    }

    // MARK: - Empty State

    private var emptyView: some View {
        VStack(spacing: 16) {
            Text("🎯")
                .font(.system(size: 50))

            Text("暂无待复习词汇")
                .font(.title3).bold()
                .foregroundColor(.white)

            Text("继续查词积累词汇\n系统会根据艾宾浩斯曲线安排复习")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)

            // Stats
            let stats = EbbinghausManager.stats(from: store.words)
            if stats.total > 0 {
                VStack(spacing: 8) {
                    HStack(spacing: 20) {
                        miniStat("总词汇", value: stats.total, color: .purple)
                        miniStat("已掌握", value: stats.mastered, color: .green)
                        miniStat("学习中", value: stats.learning, color: .orange)
                    }
                }
                .padding(.top, 20)
            }
        }
    }

    // MARK: - Done State

    private var doneView: some View {
        VStack(spacing: 16) {
            Text("🎉")
                .font(.system(size: 60))

            Text("复习完成！")
                .font(.title2).bold()
                .foregroundColor(.white)

            Text("本次复习了 \(reviewCount) 个词汇")
                .font(.subheadline)
                .foregroundColor(.gray)

            Button {
                showDoneState = false
                refreshDueWords()
            } label: {
                Text("返回")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Color.purple)
                    .foregroundColor(.white)
                    .cornerRadius(20)
            }
            .padding(.top, 12)
        }
    }

    // MARK: - Helpers

    private func miniStat(_ label: String, value: Int, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.gray)
        }
    }

    private func refreshDueWords() {
        dueWords = EbbinghausManager.dueWords(from: store.words).shuffled()
        currentIndex = 0
        isRevealed = false
        reviewCount = 0
    }

    private func handleReview(remembered: Bool) {
        guard currentIndex < dueWords.count else { return }

        let word = dueWords[currentIndex].word
        store.updateWord(word) { entry in
            EbbinghausManager.markReviewed(entry: &entry, remembered: remembered)
        }

        reviewCount += 1
        currentIndex += 1
        isRevealed = false

        if currentIndex >= dueWords.count {
            withAnimation { showDoneState = true }
        }
    }
}

// MARK: - Pulse Animation Modifier

struct PulseModifier: ViewModifier {
    @State private var isAnimating = false

    func body(content: Content) -> some View {
        content
            .opacity(isAnimating ? 0.4 : 1.0)
            .animation(
                .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                value: isAnimating
            )
            .onAppear { isAnimating = true }
    }
}
